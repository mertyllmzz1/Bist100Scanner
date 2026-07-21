// Services/ScannerService.cs

using Bist100Scanner.Models;
using Microsoft.Extensions.Logging;

namespace Bist100Scanner.Services
{
    public class FallbackFlag
    {
        public bool Value { get; set; } = false;
    }

    public class ScannerService
    {
        private readonly YahooFinanceService  _yahooService;
        private readonly TwelveDataService    _twelveService;
        private readonly IndicatorService     _indicatorService;
        private readonly BistSymbolService    _symbolService;
        private readonly ILogger<ScannerService> _logger;

        public ScannerService(
            YahooFinanceService yahooService,
            TwelveDataService twelveService,
            IndicatorService indicatorService,
            BistSymbolService symbolService,
            ILogger<ScannerService> logger)
        {
            _yahooService     = yahooService;
            _twelveService    = twelveService;
            _indicatorService = indicatorService;
            _symbolService    = symbolService;
            _logger           = logger;
        }

        public async Task<(List<StockSignal> Results, string ApiUsed, string? Warning)>
            ScanAllAsync(string interval, string apiSource, string? twelveApiKey)
        {
            var symbols = await _symbolService.GetAllSymbolsAsync();
            _logger.LogInformation("Taranacak hisse: {Count}, Kaynak: {Source}", symbols.Count, apiSource);

            int days = interval switch
            {
                "1wk" => 365 * 5,
                "1mo" => 365 * 20,
                _     => 365 * 2
            };

            bool useTwelve    = apiSource == "twelvedata" && !string.IsNullOrEmpty(twelveApiKey);
            var  fallbackFlag = new FallbackFlag();
            int  parallelism  = useTwelve ? 5 : 10;
            var  semaphore    = new SemaphoreSlim(parallelism, parallelism);

            var tasks = symbols.Select(async s =>
            {
                await semaphore.WaitAsync();
                try
                {
                    return await ScanSingleAsync(
                        s.Symbol, s.Name, interval, days,
                        useTwelve, twelveApiKey, fallbackFlag);
                }
                finally
                {
                    semaphore.Release();
                    await Task.Delay(useTwelve ? 150 : 80);
                }
            });

            var results = await Task.WhenAll(tasks);
            string? warning = fallbackFlag.Value
                ? "Twelve Data günlük limit aşıldı veya key geçersiz. Kalan hisseler Yahoo Finance'den alındı."
                : null;

            return (
                results.OrderByDescending(r => r.Score).ThenByDescending(r => r.ConditionsMet).ToList(),
                fallbackFlag.Value ? "yahoo (fallback)" : apiSource,
                warning
            );
        }

        // Haftalık + Günlük çift tarama
        public async Task<(List<ConfluenceSignal> Results, string ApiUsed, string? Warning)>
            ScanConfluenceAsync(string apiSource, string? twelveApiKey)
        {
            _logger.LogInformation("Çift tarama başladı (Haftalık + Günlük)");

            var weeklyTask = ScanAllAsync("1wk", apiSource, twelveApiKey);
            var dailyTask  = ScanAllAsync("1d",  apiSource, twelveApiKey);

            await Task.WhenAll(weeklyTask, dailyTask);

            var (weeklyResults, apiUsed, weeklyWarning) = await weeklyTask;
            var (dailyResults,  _,       dailyWarning)  = await dailyTask;

            var dailyMap = dailyResults
                .Where(r => r.ErrorMessage == null)
                .ToDictionary(r => r.Symbol, r => r);

            var confluence = weeklyResults
                .Where(w => w.ErrorMessage == null)
                .Select(weekly =>
                {
                    dailyMap.TryGetValue(weekly.Symbol, out var daily);

                    // Günlük veri hatalıysa (yetersiz bar, 404 vb.) skor hesabında yok say
                    // Ama hisseyi listeden çıkarma — haftalık skoru göster
                    var validDaily = (daily?.ErrorMessage == null) ? daily : null;

                    int confluenceScore = validDaily != null
                        ? (int)(weekly.Score * 0.6 + validDaily.Score * 0.4)
                        : weekly.Score; // Günlük veri yoksa sadece haftalık skor

                    int bonus = 0;
                    if (validDaily != null)
                    {
                        if (weekly.EmaCondition     && validDaily.EmaCondition)     bonus += 5;
                        if (weekly.MacdCrossover    && validDaily.MacdCrossover)    bonus += 5;
                        if (weekly.IsInGoldenPocket && validDaily.IsInGoldenPocket) bonus += 8;
                        if (weekly.RsiCondition     && validDaily.RsiCondition)     bonus += 3;
                        if (weekly.VolumeCondition  && validDaily.VolumeCondition)  bonus += 4;
                    }

                    return new ConfluenceSignal
                    {
                        Symbol          = weekly.Symbol,
                        Name            = weekly.Name,
                        CurrentPrice    = weekly.CurrentPrice,
                        ChangePercent   = weekly.ChangePercent,
                        Weekly          = weekly,
                        Daily           = validDaily, // hatalıysa null geçiyoruz
                        ConfluenceScore = Math.Min(confluenceScore + bonus, 100),
                        AlignmentBonus  = bonus,
                        FullAlignment   = validDaily != null &&
                                          weekly.EmaCondition && validDaily.EmaCondition &&
                                          weekly.Rsi > 50 && validDaily.Rsi is > 50 and < 75
                    };
                })
                .OrderByDescending(c => c.ConfluenceScore)
                .ThenByDescending(c => c.AlignmentBonus)
                .ToList();

            return (confluence, apiUsed, weeklyWarning ?? dailyWarning);
        }

        private async Task<StockSignal> ScanSingleAsync(
            string symbol, string name, string interval, int days,
            bool useTwelve, string? twelveApiKey, FallbackFlag fallbackFlag)
        {
            var signal = new StockSignal
            {
                Symbol = symbol.Replace(".IS", ""),
                Name   = name
            };

            try
            {
                List<OhlcvData> data;

                if (useTwelve && !fallbackFlag.Value)
                {
                    try
                    {
                        int outputSize = interval switch
                        {
                            "1wk" => 260,
                            "1mo" => 240,
                            _     => 500
                        };
                        data = await _twelveService.GetHistoricalDataAsync(
                            symbol, interval, outputSize, twelveApiKey!);
                    }
                    catch (HttpRequestException ex) when (
                        ex.Message.Contains("LIMIT") || ex.Message.Contains("INVALID_KEY"))
                    {
                        _logger.LogWarning("TwelveData fallback: {Msg}", ex.Message);
                        fallbackFlag.Value = true;
                        data = await _yahooService.GetHistoricalDataAsync(symbol, interval, days);
                    }
                }
                else
                {
                    data = await _yahooService.GetHistoricalDataAsync(symbol, interval, days);
                }

                if (data.Count == 0)
                {
                    signal.ErrorMessage = "Veri alınamadı";
                    return signal;
                }

                if (!string.IsNullOrEmpty(data[0].ShortName))
                    signal.Name = data[0].ShortName;

                signal.CurrentPrice = Math.Round(data[^1].Close, 2);

                if (data.Count >= 2)
                {
                    double prev = data[^2].Close;
                    signal.ChangePercent = Math.Round(
                        ((signal.CurrentPrice - prev) / prev) * 100, 2);
                }

                _indicatorService.Calculate(data, signal);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Hata: {Symbol}", symbol);
                signal.ErrorMessage = ex.Message;
            }

            return signal;
        }
    }

    public class ConfluenceSignal
    {
        public string       Symbol          { get; set; } = "";
        public string       Name            { get; set; } = "";
        public double       CurrentPrice    { get; set; }
        public double       ChangePercent   { get; set; }
        public StockSignal  Weekly          { get; set; } = null!;
        public StockSignal? Daily           { get; set; }
        public int          ConfluenceScore { get; set; }
        public int          AlignmentBonus  { get; set; }
        public bool         FullAlignment   { get; set; }
    }
}
