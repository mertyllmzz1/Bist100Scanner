// Abstractions/IMarketDataProvider.cs
// Veri kaynağı soyutlaması.
//
// IMarketDataProvider : tek bir kaynak (Yahoo, Twelve Data, yarın belki başka biri)
// IMarketDataChain    : sağlayıcıları sırayla deneyen zincir (Chain of Responsibility)
//
// Orkestratör ve Controller sadece IMarketDataChain'i tanır; hangi kaynağın
// devrede olduğunu, fallback olup olmadığını zincir yönetir.

using Bist100Scanner.Models;

namespace Bist100Scanner.Abstractions
{
    public interface IMarketDataProvider
    {
        // Log ve rapor için kaynak adı: "yahoo", "twelvedata"
        string Name { get; }

        // Bu context için sağlayıcı kullanılabilir mi?
        // (örn. Twelve Data sadece kullanıcı onu seçtiyse ve key girdiyse aktif)
        bool IsEnabled(ScanContext context);

        // OHLCV verisi çeker. Exception fırlatmaz — sonucu FetchResult ile bildirir.
        Task<FetchResult> GetHistoricalDataAsync(string symbol, ScanContext context);
    }

    public interface IMarketDataChain : IMarketDataProvider
    {
        // Tarama sırasında bir sağlayıcıdan diğerine geçildi mi?
        bool FallbackOccurred { get; }

        // Kullanıcıya gösterilecek fallback uyarısı (yoksa null)
        string? FallbackWarning { get; }
    }
}
