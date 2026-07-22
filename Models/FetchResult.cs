// Models/FetchResult.cs
// Result pattern: veri çekme işleminin sonucunu açıkça modelliyoruz
// Eskiden hata durumunda boş liste dönülüyordu — "veri yok" ile "hata oldu"
// ayrımı yapılamıyordu. Artık Success + Reason ile durum net.

namespace Bist100Scanner.Models
{
    // Veri çekme başarısızlık sebepleri
    public enum FetchFailureReason
    {
        None,               // Başarılı — hata yok
        NotFound,           // 404: sembol sağlayıcıda yok (delist edilmiş olabilir)
        RateLimited,        // 429: istek limiti aşıldı
        Unauthorized,       // 401: API key geçersiz
        NetworkError,       // Bağlantı/timeout hatası
        ParseError,         // Yanıt geldi ama beklenen formatta değil
        NoData,             // Yanıt geçerli ama içi boş (bar yok)
        InsufficientData,   // Veri var ama indikatör hesabı için yetersiz (< 60 bar)
        Unknown             // Sınıflandırılamayan hata
    }

    public class FetchResult
    {
        public bool               Success  { get; }
        public List<OhlcvData>    Data     { get; }
        public FetchFailureReason Reason   { get; }
        public string?            Message  { get; }
        // Veriyi hangi sağlayıcı getirdi / hata hangi sağlayıcıda oluştu
        public string             Provider { get; }

        private FetchResult(bool success, List<OhlcvData> data,
                            FetchFailureReason reason, string? message, string provider)
        {
            Success  = success;
            Data     = data;
            Reason   = reason;
            Message  = message;
            Provider = provider;
        }

        public static FetchResult Ok(List<OhlcvData> data, string provider) =>
            new(true, data, FetchFailureReason.None, null, provider);

        public static FetchResult Fail(FetchFailureReason reason, string provider, string? message = null) =>
            new(false, new List<OhlcvData>(), reason, message, provider);
    }
}
