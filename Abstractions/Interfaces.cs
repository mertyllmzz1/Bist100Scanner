// Abstractions/Interfaces.cs
// Uygulamanın diğer tüm sözleşmeleri.
// Her servis artık somut sınıf yerine buradaki interface'ler üzerinden
// enjekte edilir — test yazarken mock'lanabilir, implementasyon değişince
// (örn. MemoryCache → Redis) tüketen kod etkilenmez.

using Bist100Scanner.Models;

namespace Bist100Scanner.Abstractions
{
    // ===== SEMBOL LİSTESİ =====
    public interface ISymbolProvider
    {
        Task<List<(string Symbol, string Name)>> GetAllSymbolsAsync();
    }

    // ===== İNDİKATÖR HESAPLAMA =====
    // Sadece indikatör DEĞERLERİNİ ve koşul bayraklarını hesaplar.
    // Puanlama artık burada değil — IScoringEngine'de (sorumluluk ayrımı).
    public interface IIndicatorService
    {
        void Calculate(List<OhlcvData> data, StockSignal signal);
    }

    // ===== PUANLAMA (Strategy pattern) =====
    // Her kural kendi sınıfında yaşar. Yeni kural eklemek = yeni sınıf + DI kaydı.
    // Mevcut koda dokunulmaz (Open/Closed prensibi).
    public interface IScoringRule
    {
        string Name   { get; }
        int    Weight { get; }
        bool IsSatisfied(StockSignal signal);
    }

    public interface IScoringEngine
    {
        // Tüm kuralları çalıştırır; Score, ConditionsMet, AllConditionsMet doldurur
        void Apply(StockSignal signal);
    }

    // ===== TARAMA ORKESTRASYONU =====
    // Akışı yöneten üst katman: sembolleri al → veriyi çek → hesapla → skorla.
    // Alt servislerin hiçbiri orkestratörü tanımaz (Dependency Inversion).
    public interface IScanOrchestrator
    {
        Task<ScanOutcome>       ScanAllAsync(string interval, string apiSource, string? twelveApiKey);
        Task<ConfluenceOutcome> ScanConfluenceAsync(string apiSource, string? twelveApiKey);
    }

    // ===== CACHE SOYUTLAMASI =====
    // Bugün IMemoryCache, yarın Redis. Tüketen kod bu interface'i bilir,
    // geçişte sadece DI kaydı değişir.
    public interface ICacheService
    {
        bool TryGet<T>(string key, out T? value);
        void Set<T>(string key, T value, TimeSpan ttl);
        void Remove(string key);
    }

    // ===== BAŞARISIZ VERİ ÇEKME LOGU =====
    // Alınamayan her hisse, sembol adıyla birlikte günlük dosyaya yazılır:
    // logs/failed-symbols-yyyy-MM-dd.log
    public interface IFailedFetchLogger
    {
        Task LogAsync(string symbol, string provider, FetchFailureReason reason, string? message = null);
    }
}
