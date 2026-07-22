// Services/MarketData/FallbackMarketDataProvider.cs
// Chain of Responsibility: sağlayıcıları sırayla dener.
//
// Sıra: [TwelveData → Yahoo]
//   - TwelveData yalnızca kullanıcı seçtiyse ve key varsa devreye girer
//   - RateLimited (429) veya Unauthorized (401) alan sağlayıcı, isteğin geri
//     kalanı boyunca devre dışı bırakılır — her hisse için tekrar denenip
//     limit yakılmaz (eski FallbackFlag'in yaptığı iş, artık async/ref
//     workaround'una gerek kalmadan)
//   - Başarısız her deneme IFailedFetchLogger ile sembol adıyla dosyaya yazılır
//
// Scoped kayıtlıdır: devre dışı bırakma durumu tek HTTP isteği boyunca yaşar,
// istekler arasında taşınmaz. Paralel tarama için ConcurrentDictionary kullanılır.

using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services.MarketData
{
    public class FallbackMarketDataProvider : IMarketDataChain
    {
        public string Name => "fallback-chain";

        private readonly IReadOnlyList<IMarketDataProvider> _providers;
        private readonly IFailedFetchLogger _failLogger;
        private readonly ILogger<FallbackMarketDataProvider> _logger;

        // Bu istek boyunca devre dışı bırakılan sağlayıcılar (thread-safe)
        private readonly ConcurrentDictionary<string, FetchFailureReason> _disabled = new();

        public bool    FallbackOccurred { get; private set; }
        public string? FallbackWarning  { get; private set; }

        public FallbackMarketDataProvider(
            TwelveDataProvider twelveData,
            YahooFinanceProvider yahoo,
            IFailedFetchLogger failLogger,
            ILogger<FallbackMarketDataProvider> logger)
        {
            // Zincir sırası: önce kullanıcı tercihi (TwelveData), sonra garanti fallback (Yahoo)
            _providers  = new IMarketDataProvider[] { twelveData, yahoo };
            _failLogger = failLogger;
            _logger     = logger;
        }

        public bool IsEnabled(ScanContext context) => true;

        public async Task<FetchResult> GetHistoricalDataAsync(string symbol, ScanContext context)
        {
            FetchResult? lastFailure = null;

            foreach (var provider in _providers)
            {
                if (!provider.IsEnabled(context))          continue;
                if (_disabled.ContainsKey(provider.Name))  continue;

                var result = await provider.GetHistoricalDataAsync(symbol, context);

                if (result.Success)
                    return result;

                lastFailure = result;

                // Başarısız denemeyi sembol adıyla dosyaya logla
                await _failLogger.LogAsync(symbol, provider.Name, result.Reason, result.Message);

                // Limit/key hatası → bu sağlayıcıyı isteğin kalanında devre dışı bırak
                if (result.Reason is FetchFailureReason.RateLimited
                                  or FetchFailureReason.Unauthorized)
                {
                    if (_disabled.TryAdd(provider.Name, result.Reason))
                    {
                        _logger.LogWarning(
                            "{Provider} devre dışı bırakıldı ({Reason}), sonraki sağlayıcıya geçiliyor.",
                            provider.Name, result.Reason);

                        // Kullanıcının tercih ettiği kaynak düştüyse uyarı üret
                        if (provider.Name == context.ApiSource)
                        {
                            FallbackOccurred = true;
                            FallbackWarning  =
                                "Twelve Data günlük limit aşıldı veya key geçersiz. " +
                                "Kalan hisseler Yahoo Finance'den alındı.";
                        }
                    }
                }
                // Diğer hatalarda (404, parse vb.) sağlayıcı devre dışı kalmaz;
                // sadece bu sembol için zincirdeki bir sonraki kaynağa geçilir.
            }

            // Zincirdeki hiçbir sağlayıcı veri getiremedi
            return lastFailure
                ?? FetchResult.Fail(FetchFailureReason.NoData, Name, "Uygun sağlayıcı yok");
        }
    }
}
