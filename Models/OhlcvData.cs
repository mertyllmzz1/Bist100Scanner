// Models/OhlcvData.cs
// Tek bir barın OHLCV verisi — tüm veri sağlayıcıların ortak çıktı formatı
// Daha önce YahooFinanceService içindeydi; model olduğu için Models'e taşındı

namespace Bist100Scanner.Models
{
    public class OhlcvData
    {
        public DateTime Date      { get; set; }
        public double   Open      { get; set; }
        public double   High      { get; set; }
        public double   Low       { get; set; }
        public double   Close     { get; set; }
        public long     Volume    { get; set; }

        // Sağlayıcıdan gelen doğrulanmış kısa hisse adı (örn. Yahoo meta.shortName)
        public string   ShortName { get; set; } = "";
    }
}
