// Services/TwelveDataService.cs
// Twelve Data API'den OHLCV verisi çeker
// Ücretsiz tier: 800 istek/gün, 8 istek/dakika
// Limit aşılınca (429) veya key geçersizse (401) exception fırlatır
// ScannerService bunu yakalar ve Yahoo'ya fallback yapar

using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Bist100Scanner.Services
{
    public class TwelveDataService
    {
        private readonly HttpClient   _httpClient;
        private readonly IMemoryCache _cache;
        private readonly ILogger<TwelveDataService> _logger;

        private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(2);

        public TwelveDataService(
            IHttpClientFactory httpClientFactory,
            IMemoryCache cache,
            ILogger<TwelveDataService> logger)
        {
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "BistScanner/1.0");
            _cache  = cache;
            _logger = logger;
        }

        // Twelve Data'dan OHLCV çeker
        // apiKey: kullanıcının girdiği key
        // Throws: HttpRequestException (429 limit, 401 geçersiz key)
        public async Task<List<OhlcvData>> GetHistoricalDataAsync(
            string symbol, string interval, int outputSize, string apiKey)
        {
            // Sembol: THYAO.IS → Twelve Data formatı: THYAO/TRY (BIST hisseleri TRY cinsinden)
            // Ama Twelve Data BIST sembollerini doğrudan THYAO:BIST formatında da kabul ediyor
            var tdSymbol = symbol.Replace(".IS", "") + ":BIST";

            // Twelve Data interval formatı: "1day", "1week", "1month"
            var tdInterval = interval switch
            {
                "1wk" => "1week",
                "1mo" => "1month",
                "1h"  => "1h",
                _     => "1day"
            };

            var cacheKey = $"td_ohlcv:{symbol}:{interval}:{outputSize}";

            if (_cache.TryGetValue(cacheKey, out List<OhlcvData>? cached) && cached != null)
            {
                _logger.LogDebug("TwelveData cache hit: {Symbol}", symbol);
                return cached;
            }

            var url = $"https://api.twelvedata.com/time_series" +
                      $"?symbol={tdSymbol}&interval={tdInterval}&outputsize={outputSize}" +
                      $"&apikey={apiKey}&format=JSON&order=ASC";

            // Bu satır 429 veya 401 gelirse HttpRequestException fırlatır
            // ScannerService bunu yakalayıp Yahoo'ya geçer
            var response = await _httpClient.GetAsync(url);

            if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                throw new HttpRequestException("TWELVE_DATA_LIMIT_EXCEEDED");

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                throw new HttpRequestException("TWELVE_DATA_INVALID_KEY");

            response.EnsureSuccessStatusCode();

            var raw  = await response.Content.ReadAsStringAsync();
            var data = ParseTwelveDataResponse(raw);

            if (data.Count > 0)
            {
                _cache.Set(cacheKey, data, new MemoryCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = CacheDuration,
                    Size = data.Count
                });
            }

            return data;
        }

        // Twelve Data için tüm BIST sembollerini çeker
        // Bu endpoint günde 1 kez çağrılır, 1 istek harcar
        public async Task<List<(string Symbol, string Name)>> GetBistSymbolsAsync(string apiKey)
        {
            var url = $"https://api.twelvedata.com/stocks?exchange=BIST&apikey={apiKey}&format=JSON";

            var raw  = await _httpClient.GetStringAsync(url);
            var jObj = JObject.Parse(raw);

            if (jObj["status"]?.ToString() == "error")
                throw new HttpRequestException($"TwelveData hata: {jObj["message"]}");

            var result = new List<(string, string)>();
            var data   = jObj["data"];

            if (data == null) return result;

            foreach (var item in data)
            {
                var sym  = item["symbol"]?.ToString() ?? "";
                var name = item["name"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(sym))
                    result.Add(($"{sym}.IS", name));
            }

            return result;
        }

        private List<OhlcvData> ParseTwelveDataResponse(string json)
        {
            var result = new List<OhlcvData>();
            var jObj   = JObject.Parse(json);

            // Hata kontrolü
            if (jObj["status"]?.ToString() == "error")
            {
                var msg = jObj["message"]?.ToString() ?? "Bilinmeyen hata";
                if (msg.Contains("limit") || msg.Contains("quota"))
                    throw new HttpRequestException("TWELVE_DATA_LIMIT_EXCEEDED");
                throw new HttpRequestException($"TwelveData: {msg}");
            }

            var values   = jObj["values"];
            var metaName = jObj["meta"]?["name"]?.ToString() ?? "";

            if (values == null) return result;

            foreach (var v in values)
            {
                if (!DateTime.TryParse(v["datetime"]?.ToString(), out var dt)) continue;
                if (!double.TryParse(v["open"]?.ToString(),   System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var open))   continue;
                if (!double.TryParse(v["high"]?.ToString(),   System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var high))   continue;
                if (!double.TryParse(v["low"]?.ToString(),    System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var low))    continue;
                if (!double.TryParse(v["close"]?.ToString(),  System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var close))  continue;
                if (!long.TryParse(v["volume"]?.ToString(),   out var volume)) volume = 0;

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

            return result;
        }
    }
}
