// Services/MarketData/TwelveDataProvider.cs
// Twelve Data API'den OHLCV çeker. Ücretsiz tier: 800 istek/gün, 8 istek/dk.
// Eski TwelveDataService'in IMarketDataProvider implementasyonu:
//   - Limit (429) veya geçersiz key (401) durumunda exception fırlatmaz;
//     RateLimited / Unauthorized sebepli FetchResult döner.
//   - Fallback kararını artık bu sınıf DEĞİL, zincir (FallbackMarketDataProvider) verir.

using System.Globalization;
using System.Net;
using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services.MarketData
{
    public class TwelveDataProvider : IMarketDataProvider
    {
        public string Name => "twelvedata";

        private readonly HttpClient    _httpClient;
        private readonly ICacheService _cache;
        private readonly ILogger<TwelveDataProvider> _logger;

        private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(2);

        public TwelveDataProvider(
            IHttpClientFactory httpClientFactory,
            ICacheService cache,
            ILogger<TwelveDataProvider> logger)
        {
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "BistScanner/1.0");
            _cache  = cache;
            _logger = logger;
        }

        // Sadece kullanıcı Twelve Data'yı seçtiyse VE key girdiyse aktif
        public bool IsEnabled(ScanContext context) =>
            context.ApiSource == "twelvedata" &&
            !string.IsNullOrEmpty(context.TwelveApiKey);

        public async Task<FetchResult> GetHistoricalDataAsync(string symbol, ScanContext context)
        {
            // THYAO.IS → Twelve Data formatı: THYAO:BIST
            var tdSymbol = symbol.Replace(".IS", "") + ":BIST";

            // Yahoo interval formatı → Twelve Data formatı
            var tdInterval = context.Interval switch
            {
                "1wk" => "1week",
                "1mo" => "1month",
                "1h"  => "1h",
                _     => "1day"
            };

            var cacheKey = $"ohlcv:twelvedata:{symbol}:{context.Interval}:{context.OutputSize}";

            if (_cache.TryGet(cacheKey, out List<OhlcvData>? cached) && cached != null)
            {
                _logger.LogDebug("TwelveData cache hit: {Symbol}", symbol);
                return FetchResult.Ok(cached, Name);
            }

            try
            {
                var url = $"https://api.twelvedata.com/time_series" +
                          $"?symbol={tdSymbol}&interval={tdInterval}&outputsize={context.OutputSize}" +
                          $"&apikey={context.TwelveApiKey}&format=JSON&order=ASC";

                var response = await _httpClient.GetAsync(url);

                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                    return FetchResult.Fail(FetchFailureReason.RateLimited, Name,
                        "TWELVE_DATA_LIMIT_EXCEEDED");

                if (response.StatusCode == HttpStatusCode.Unauthorized)
                    return FetchResult.Fail(FetchFailureReason.Unauthorized, Name,
                        "TWELVE_DATA_INVALID_KEY");

                if (!response.IsSuccessStatusCode)
                    return FetchResult.Fail(FetchFailureReason.Unknown, Name,
                        $"HTTP {(int)response.StatusCode}");

                var raw = await response.Content.ReadAsStringAsync();
                return ParseTwelveDataResponse(raw, cacheKey);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "TwelveData ağ hatası: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.NetworkError, Name, ex.Message);
            }
            catch (Newtonsoft.Json.JsonException ex)
            {
                _logger.LogError(ex, "TwelveData parse hatası: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.ParseError, Name, ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "TwelveData bilinmeyen hata: {Symbol}", symbol);
                return FetchResult.Fail(FetchFailureReason.Unknown, Name, ex.Message);
            }
        }

        private FetchResult ParseTwelveDataResponse(string json, string cacheKey)
        {
            var result = new List<OhlcvData>();
            var jObj   = JObject.Parse(json);

            // Twelve Data hataları HTTP 200 ile body içinde de dönebiliyor
            if (jObj["status"]?.ToString() == "error")
            {
                var msg = jObj["message"]?.ToString() ?? "Bilinmeyen hata";

                if (msg.Contains("limit") || msg.Contains("quota"))
                    return FetchResult.Fail(FetchFailureReason.RateLimited, Name, msg);

                return FetchResult.Fail(FetchFailureReason.Unknown, Name, msg);
            }

            var values   = jObj["values"];
            var metaName = jObj["meta"]?["name"]?.ToString() ?? "";

            if (values == null)
                return FetchResult.Fail(FetchFailureReason.NoData, Name, "values alanı yok");

            foreach (var v in values)
            {
                if (!DateTime.TryParse(v["datetime"]?.ToString(), out var dt)) continue;
                if (!double.TryParse(v["open"]?.ToString(),  NumberStyles.Float, CultureInfo.InvariantCulture, out var open))  continue;
                if (!double.TryParse(v["high"]?.ToString(),  NumberStyles.Float, CultureInfo.InvariantCulture, out var high))  continue;
                if (!double.TryParse(v["low"]?.ToString(),   NumberStyles.Float, CultureInfo.InvariantCulture, out var low))   continue;
                if (!double.TryParse(v["close"]?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var close)) continue;
                if (!long.TryParse(v["volume"]?.ToString(),  out var volume)) volume = 0;

                result.Add(new OhlcvData
                {
                    Date      = dt,
                    Open      = open,
                    High      = high,
                    Low       = low,
                    Close     = close,
                    Volume    = volume,
                    ShortName = metaName
                });
            }

            if (result.Count == 0)
                return FetchResult.Fail(FetchFailureReason.NoData, Name, "Geçerli bar yok");

            _cache.Set(cacheKey, result, CacheDuration);
            return FetchResult.Ok(result, Name);
        }
    }
}
