// Services/MemoryCacheService.cs
// ICacheService'in IMemoryCache implementasyonu.
// Redis'e geçileceği gün: RedisCacheService yazılır, Program.cs'te
// tek satır DI kaydı değişir — başka hiçbir dosyaya dokunulmaz.

using Microsoft.Extensions.Caching.Memory;
using Bist100Scanner.Abstractions;

namespace Bist100Scanner.Services
{
    public class MemoryCacheService : ICacheService
    {
        private readonly IMemoryCache _cache;

        public MemoryCacheService(IMemoryCache cache)
        {
            _cache = cache;
        }

        public bool TryGet<T>(string key, out T? value)
        {
            if (_cache.TryGetValue(key, out T? cached) && cached != null)
            {
                value = cached;
                return true;
            }

            value = default;
            return false;
        }

        public void Set<T>(string key, T value, TimeSpan ttl)
        {
            _cache.Set(key, value, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = ttl,
                Priority = CacheItemPriority.Normal
            });
        }

        public void Remove(string key) => _cache.Remove(key);
    }
}
