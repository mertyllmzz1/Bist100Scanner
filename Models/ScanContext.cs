// Models/ScanContext.cs
// Bir taramanın tüm parametrelerini taşıyan immutable record.
// Eskiden bu bilgiler metot parametresi olarak elden ele dolaşıyordu
// (interval, days, useTwelve, twelveApiKey, fallbackFlag...).
// Tek bir context nesnesi hem imzaları sadeleştirir hem yeni parametre
// eklemeyi kolaylaştırır.

namespace Bist100Scanner.Models
{
    public record ScanContext(
        string  Interval,        // Yahoo formatı: "1d", "1wk", "1mo", "1h"
        int     Days,            // Yahoo için: kaç günlük veri
        int     OutputSize,      // Twelve Data için: kaç bar
        string  ApiSource,       // Kullanıcının seçtiği kaynak: "yahoo" | "twelvedata"
        string? TwelveApiKey     // Twelve Data key (opsiyonel)
    );
}
