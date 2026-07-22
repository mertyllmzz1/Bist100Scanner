// Controllers/ScannerController.cs
// Sadece HTTP katmanı: istek al → cache kontrol → orkestratöre delege et →
// yanıtı biçimlendir. İş mantığı içermez.
// Tüm bağımlılıklar interface üzerinden — somut servis sınıfı tanımaz.

using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Skender.Stock.Indicators;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ScannerController : ControllerBase
    {
        private readonly IScanOrchestrator _orchestrator;
        private readonly ISymbolProvider   _symbolProvider;
        private readonly IMarketDataChain  _marketData;
        private readonly ICacheService     _cache;
        private readonly ILogger<ScannerController> _logger;

        private static string ScanCacheKey(string interval, string source) =>
            $"scan_results:{interval}:{source}";
        private static readonly TimeSpan ScanCacheDuration = TimeSpan.FromHours(2);

        public ScannerController(
            IScanOrchestrator orchestrator,
            ISymbolProvider symbolProvider,
            IMarketDataChain marketData,
            ICacheService cache,
            ILogger<ScannerController> logger)
        {
            _orchestrator   = orchestrator;
            _symbolProvider = symbolProvider;
            _marketData     = marketData;
            _cache          = cache;
            _logger         = logger;
        }

        // POST /api/scanner/scan
        [HttpPost("scan")]
        public async Task<IActionResult> Scan([FromBody] ScanRequest request)
        {
            try
            {
                string yahooInterval = request.Interval switch
                {
                    "weekly"  => "1wk",
                    "monthly" => "1mo",
                    _         => "1d"
                };

                var cacheKey = ScanCacheKey(yahooInterval, request.ApiSource);

                if (_cache.TryGet(cacheKey, out CachedScanResult? cached) && cached != null)
                {
                    return Ok(new
                    {
                        success        = true,
                        count          = cached.Data.Count,
                        data           = cached.Data,
                        scannedAt      = cached.ScannedAt,
                        fromCache      = true,
                        cacheExpiresAt = cached.ExpiresAt.ToString("HH:mm"),
                        apiUsed        = cached.ApiUsed,
                        warning        = cached.Warning
                    });
                }

                var outcome = await _orchestrator.ScanAllAsync(
                    yahooInterval, request.ApiSource, request.TwelveApiKey);

                var scannedAt = DateTime.Now.ToString("dd.MM.yyyy HH:mm");

                var entry = new CachedScanResult
                {
                    Data      = outcome.Results,
                    ScannedAt = scannedAt,
                    ExpiresAt = DateTime.Now.Add(ScanCacheDuration),
                    ApiUsed   = outcome.ApiUsed,
                    Warning   = outcome.Warning
                };

                _cache.Set(cacheKey, entry, ScanCacheDuration);

                return Ok(new
                {
                    success        = true,
                    count          = outcome.Results.Count,
                    data           = outcome.Results,
                    scannedAt,
                    fromCache      = false,
                    cacheExpiresAt = entry.ExpiresAt.ToString("HH:mm"),
                    apiUsed        = outcome.ApiUsed,
                    warning        = outcome.Warning
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tarama hatası");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // POST /api/scanner/confluence
        // Haftalık + Günlük çift tarama — confluence analizi
        [HttpPost("confluence")]
        public async Task<IActionResult> Confluence([FromBody] ScanRequest request)
        {
            try
            {
                var cacheKey = $"confluence:{request.ApiSource}";

                if (_cache.TryGet(cacheKey, out CachedConfluenceResult? cached) && cached != null)
                {
                    return Ok(new
                    {
                        success        = true,
                        count          = cached.Data.Count,
                        data           = cached.Data,
                        scannedAt      = cached.ScannedAt,
                        fromCache      = true,
                        cacheExpiresAt = cached.ExpiresAt.ToString("HH:mm"),
                        apiUsed        = cached.ApiUsed,
                        warning        = cached.Warning
                    });
                }

                var outcome = await _orchestrator.ScanConfluenceAsync(
                    request.ApiSource, request.TwelveApiKey);

                var scannedAt = DateTime.Now.ToString("dd.MM.yyyy HH:mm");
                var entry = new CachedConfluenceResult
                {
                    Data      = outcome.Results,
                    ScannedAt = scannedAt,
                    ExpiresAt = DateTime.Now.Add(ScanCacheDuration),
                    ApiUsed   = outcome.ApiUsed,
                    Warning   = outcome.Warning
                };

                _cache.Set(cacheKey, entry, ScanCacheDuration);

                return Ok(new
                {
                    success        = true,
                    count          = outcome.Results.Count,
                    data           = outcome.Results,
                    scannedAt,
                    fromCache      = false,
                    cacheExpiresAt = entry.ExpiresAt.ToString("HH:mm"),
                    apiUsed        = outcome.ApiUsed,
                    warning        = outcome.Warning
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Confluence tarama hatası");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // GET /api/scanner/chart/{symbol}?interval=1d
        [HttpGet("chart/{symbol}")]
        public async Task<IActionResult> GetChartData(
            string symbol,
            [FromQuery] string interval = "1d",
            [FromQuery] int days = 365)
        {
            try
            {
                var fullSymbol = symbol.EndsWith(".IS") ? symbol : $"{symbol}.IS";
                if (interval == "1h") days = 59;

                // Grafik her zaman Yahoo'dan gelir (saatlik interval desteği için)
                var context = new ScanContext(interval, days, 500, "yahoo", null);
                var fetch   = await _marketData.GetHistoricalDataAsync(fullSymbol, context);

                if (!fetch.Success || fetch.Data.Count == 0)
                    return NotFound(new { message = "Veri bulunamadı" });

                var data = fetch.Data;

                var quotes = data.Select(d => new Quote
                {
                    Date   = d.Date,
                    Open   = (decimal)d.Open,
                    High   = (decimal)d.High,
                    Low    = (decimal)d.Low,
                    Close  = (decimal)d.Close,
                    Volume = d.Volume
                }).ToList();

                var ema20 = quotes.GetEma(20).ToList();
                var ema50 = quotes.GetEma(50).ToList();

                bool useTimestamp = interval == "1h";
                object TimeKey(DateTime dt) => useTimestamp
                    ? (object)new DateTimeOffset(dt).ToUnixTimeSeconds()
                    : dt.ToString("yyyy-MM-dd");

                var candles = data.Select(d => new
                {
                    time  = TimeKey(d.Date),
                    open  = Math.Round(d.Open,  2),
                    high  = Math.Round(d.High,  2),
                    low   = Math.Round(d.Low,   2),
                    close = Math.Round(d.Close, 2)
                }).ToList();

                var volumes = data.Select((d, i) => new
                {
                    time  = TimeKey(d.Date),
                    value = d.Volume,
                    color = i > 0 && d.Close >= data[i - 1].Close
                        ? "rgba(79,255,176,0.4)" : "rgba(255,77,109,0.4)"
                }).ToList();

                var ema20Data = ema20.Where(e => e.Ema.HasValue)
                    .Select(e => new { time = TimeKey(e.Date), value = Math.Round((double)e.Ema!, 2) }).ToList();
                var ema50Data = ema50.Where(e => e.Ema.HasValue)
                    .Select(e => new { time = TimeKey(e.Date), value = Math.Round((double)e.Ema!, 2) }).ToList();

                var recent    = data.TakeLast(50).ToList();
                var swingHigh = recent.Max(d => d.High);
                var swingLow  = recent.Min(d => d.Low);
                var range     = swingHigh - swingLow;

                return Ok(new
                {
                    symbol, interval, candles, volumes,
                    ema20 = ema20Data, ema50 = ema50Data,
                    fibonacci = new
                    {
                        swingHigh, swingLow,
                        fib382             = Math.Round(swingHigh - range * 0.382, 2),
                        fib50              = Math.Round(swingHigh - range * 0.500, 2),
                        goldenPocketTop    = Math.Round(swingHigh - range * 0.618, 2),
                        goldenPocketBottom = Math.Round(swingHigh - range * 0.650, 2),
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Grafik hatası: {Symbol}", symbol);
                return StatusCode(500, new { message = ex.Message });
            }
        }

        // GET /api/scanner/symbols
        [HttpGet("symbols")]
        public async Task<IActionResult> GetSymbols()
        {
            var symbols = await _symbolProvider.GetAllSymbolsAsync();
            return Ok(symbols.Select(s => new
            {
                symbol = s.Symbol.Replace(".IS", ""),
                name   = s.Name
            }));
        }

        // GET /api/scanner/symbol-stats
        [HttpGet("symbol-stats")]
        public async Task<IActionResult> GetSymbolStats()
        {
            var symbols = await _symbolProvider.GetAllSymbolsAsync();
            return Ok(new
            {
                total   = symbols.Count,
                sample  = symbols.Take(10).Select(s => s.Symbol.Replace(".IS", "")),
                message = symbols.Count < 400
                    ? "⚠️ Beklenenin altında — dinamik kaynaklar kısıtlı olabilir"
                    : "✓ Hisse listesi tam"
            });
        }

        // GET /api/scanner/cache-status
        [HttpGet("cache-status")]
        public IActionResult GetCacheStatus()
        {
            var intervals = new[] { "1d", "1wk", "1mo" };
            var sources   = new[] { "yahoo", "twelvedata" };
            var status    = intervals.SelectMany(interval =>
                sources.Select(source =>
                {
                    var key    = ScanCacheKey(interval, source);
                    var exists = _cache.TryGet(key, out CachedScanResult? entry);
                    return new
                    {
                        interval, source,
                        cached    = exists,
                        scannedAt = entry?.ScannedAt,
                        expiresAt = entry?.ExpiresAt.ToString("HH:mm"),
                        count     = entry?.Data.Count ?? 0
                    };
                })
            );
            return Ok(status);
        }
    }
}
