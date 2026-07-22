// Services/BistSymbolService.cs
// ISymbolProvider implementasyonu.
// 446 satırlık hardcoded liste artık burada değil — Data/BistSymbols.cs'te.
// Bu sınıfın tek işi listeyi cache üzerinden sunmak.

using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Data;

namespace Bist100Scanner.Services
{
    public class BistSymbolService : ISymbolProvider
    {
        private readonly ICacheService _cache;
        private readonly ILogger<BistSymbolService> _logger;

        private const string CACHE_KEY = "bist_all_symbols";
        private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(24);

        public BistSymbolService(
            ICacheService cache,
            ILogger<BistSymbolService> logger)
        {
            _cache  = cache;
            _logger = logger;
        }

        public Task<List<(string Symbol, string Name)>> GetAllSymbolsAsync()
        {
            if (_cache.TryGet(CACHE_KEY, out List<(string, string)>? cached) && cached != null)
                return Task.FromResult(cached);

            // Hardcoded liste — isimler Yahoo'dan ShortName ile tarama sırasında dolar
            var list = BistSymbols.GetAll();

            _cache.Set(CACHE_KEY, list, CacheDuration);
            _logger.LogInformation("Hisse listesi yüklendi: {Count} sembol.", list.Count);

            return Task.FromResult(list);
        }
    }
}
