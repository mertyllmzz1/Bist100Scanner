// Services/YahooFinanceService.cs
// Yahoo Finance'den OHLCV + hisse adı çeker
// Her sembol + interval kombinasyonu 2 saat cache'lenir

using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Bist100Scanner.Services
{
    public class YahooFinanceService
    {
        private readonly HttpClient   _httpClient;
        private readonly IMemoryCache _cache;
        private readonly ILogger<YahooFinanceService> _logger;

        private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(2);

        public YahooFinanceService(
            IHttpClientFactory httpClientFactory,
            IMemoryCache cache,
            ILogger<YahooFinanceService> logger)
        {
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.DefaultRequestHeaders.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            _cache  = cache;
            _logger = logger;
        }

        // OHLCV verisi çeker, 2 saat cache'ler
        // Aynı gün içinde tekrar çağrılırsa Yahoo'ya gitmez
        public async Task<List<OhlcvData>> GetHistoricalDataAsync(
            string symbol, string interval, int days = 365)
        {
            var cacheKey = $"ohlcv:{symbol}:{interval}:{days}";

            if (_cache.TryGetValue(cacheKey, out List<OhlcvData>? cached) && cached != null)
            {
                _logger.LogDebug("Cache hit: {Symbol}", symbol);
                return cached;
            }

            try
            {
                var endTime   = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var startTime = DateTimeOffset.UtcNow.AddDays(-days).ToUnixTimeSeconds();

                var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}" +
                          $"?period1={startTime}&period2={endTime}&interval={interval}";

                var response = await _httpClient.GetStringAsync(url);
                var data     = ParseYahooResponse(response);

                if (data.Count > 0)
                {
                    _cache.Set(cacheKey, data, new MemoryCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = CacheDuration,
                        Priority = CacheItemPriority.Normal,
                        Size     = data.Count
                    });
                }

                return data;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Veri çekme hatası: {Symbol}", symbol);
                return new List<OhlcvData>();
            }
        }

        private List<OhlcvData> ParseYahooResponse(string json)
        {
            var result  = new List<OhlcvData>();
            var jObject = JObject.Parse(json);

            // meta.shortName: Yahoo'nun doğrulanmış hisse adı
            // KAP'tan gelen isim üzerine yazılır (daha kısa ve tanıdık format)
            var shortName = jObject["chart"]?["result"]?[0]?["meta"]?["shortName"]?.ToString()
                         ?? jObject["chart"]?["result"]?[0]?["meta"]?["longName"]?.ToString()
                         ?? "";

            var timestamps = jObject["chart"]?["result"]?[0]?["timestamp"]?.ToObject<long[]>();
            var quote      = jObject["chart"]?["result"]?[0]?["indicators"]?["quote"]?[0];
            var closes     = quote?["close"]?.ToObject<double?[]>();
            var opens      = quote?["open"]?.ToObject<double?[]>();
            var highs      = quote?["high"]?.ToObject<double?[]>();
            var lows       = quote?["low"]?.ToObject<double?[]>();
            var volumes    = quote?["volume"]?.ToObject<long?[]>();

            if (timestamps == null || closes == null) return result;

            for (int i = 0; i < timestamps.Length; i++)
            {
                if (closes[i] == null || opens[i] == null || highs[i] == null ||
                    lows[i]   == null || volumes[i] == null) continue;

                result.Add(new OhlcvData
                {
                    Date      = DateTimeOffset.FromUnixTimeSeconds(timestamps[i]).DateTime,
                    Open      = opens[i]!.Value,
                    High      = highs[i]!.Value,
                    Low       = lows[i]!.Value,
                    Close     = closes[i]!.Value,
                    Volume    = volumes[i]!.Value,
                    ShortName = shortName
                });
            }

            return result;
        }
    }

    public class OhlcvData
    {
        public DateTime Date      { get; set; }
        public double   Open      { get; set; }
        public double   High      { get; set; }
        public double   Low       { get; set; }
        public double   Close     { get; set; }
        public long     Volume    { get; set; }
        // Yahoo'dan gelen doğrulanmış kısa hisse adı
        public string   ShortName { get; set; } = "";
    }
}
