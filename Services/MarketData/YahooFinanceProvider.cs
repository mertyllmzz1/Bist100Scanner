// Services/MarketData/YahooFinanceProvider.cs
// Yahoo Finance /v8/finance/chart endpoint'inden OHLCV + hisse adı çeker.
// Eski YahooFinanceService'in IMarketDataProvider implementasyonu:
//   - Exception fırlatmak / boş liste dönmek yerine FetchResult döner
//   - Her sembol + interval kombinasyonu 2 saat cache'lenir (ICacheService)

using System.Net;
using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services.MarketData
{
    public class YahooFinanceProvider : IMarketDataProvider
    {
        public string Name => "yahoo";

        private readonly HttpClient    _httpClient;
        private readonly ICacheService _cache;
        private readonly ILogger<YahooFinanceProvider> _logger;

        private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(2);

        public YahooFinanceProvider(
            IHttpClientFactory httpClientFactory,
            ICacheService cache,
            ILogger<YahooFinanceProvider> logger)
        {
            _httpClient = httpClientFactory.CreateClient();
            // Yahoo bot engellemesi yapıyor — browser gibi görünelim
            _httpClient.DefaultRequestHeaders.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            _cache  = cache;
            _logger = logger;
        }

        // Yahoo her zaman kullanılabilir — zincirin son halkası (garanti fallback)
        public bool IsEnabled(ScanContext context) => true;

        public async Task<FetchResult> GetHistoricalDataAsync(string symbol, ScanContext context)
        {
            var cacheKey = $"ohlcv:yahoo:{symbol}:{context.Interval}:{context.Days}";

            if (_cache.TryGet(cacheKey, out List<OhlcvData>? cached) && cached != null)
            {
                _logger.LogDebug("Yahoo cache hit: {Symbol}", symbol);
                return FetchResult.Ok(cached, Name);
            }

            try
            {
                var endTime   = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var startTime = DateTimeOffset.UtcNow.AddDays(-context.Days).ToUnixTimeSeconds();

                var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}" +
                          $"?period1={startTime}&period2={endTime}&interval={context.Interval}";

                var response = await _httpClient.GetAsync(url);

                // HTTP durum kodlarını anlamlı sebeplere çevir
                if (response.StatusCode == HttpStatusCode.NotFound)
                    return FetchResult.Fail(FetchFailureReason.NotFound, Name, "404");

                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                    return FetchResult.Fail(FetchFailureReason.RateLimited, Name, "429");

                if (!response.IsSuccessStatusCode)
                    return FetchResult.Fail(FetchFailureReason.Unknown, Name,
                        $"HTTP {(int)response.StatusCode}");

                var json = await response.Content.ReadAsStringAsync();
                var data = ParseYahooResponse(json);

                if (data.Count == 0)
                    return FetchResult.Fail(FetchFailureReason.NoData, Name, "Yanıt boş");

                _cache.Set(cacheKey, data, CacheDuration);
                return FetchResult.Ok(data, Name);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Yahoo ağ hatası: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.NetworkError, Name, ex.Message);
            }
            catch (Newtonsoft.Json.JsonException ex)
            {
                _logger.LogError(ex, "Yahoo parse hatası: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.ParseError, Name, ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Yahoo bilinmeyen hata: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.Unknown, Name, ex.Message);
            }
        }

        private static List<OhlcvData> ParseYahooResponse(string json)
        {
            var result  = new List<OhlcvData>();
            var jObject = JObject.Parse(json);

            // meta.shortName: Yahoo'nun doğrulanmış hisse adı —
            // hardcoded listedeki boş isimlerin üzerine yazılır
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
}
