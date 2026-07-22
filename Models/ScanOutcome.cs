// Models/ScanOutcome.cs
// Tarama sonuçlarını taşıyan modeller.
// ConfluenceSignal daha önce ScannerService içindeydi, CachedScanResult ve
// CachedConfluenceResult ise Controller dosyasındaydı — hepsi model oldukları
// için buraya taşındı. (Controller/Service dosyaları sadece davranış içermeli.)

namespace Bist100Scanner.Models
{
    // ScanAllAsync'in dönüş tipi — eskiden isimsiz tuple'dı
    public record ScanOutcome(
        List<StockSignal> Results,
        string            ApiUsed,
        string?           Warning);

    // ScanConfluenceAsync'in dönüş tipi
    public record ConfluenceOutcome(
        List<ConfluenceSignal> Results,
        string                 ApiUsed,
        string?                Warning);

    // Haftalık + Günlük çift tarama sonucu
    public class ConfluenceSignal
    {
        public string       Symbol          { get; set; } = "";
        public string       Name            { get; set; } = "";
        public double       CurrentPrice    { get; set; }
        public double       ChangePercent   { get; set; }
        public StockSignal  Weekly          { get; set; } = null!;
        public StockSignal? Daily           { get; set; }
        public int          ConfluenceScore { get; set; }
        public int          AlignmentBonus  { get; set; }
        public bool         FullAlignment   { get; set; }
    }

    // Cache'e yazılan tarama sonucu zarfı
    public class CachedScanResult
    {
        public List<StockSignal> Data      { get; set; } = new();
        public string            ScannedAt { get; set; } = "";
        public DateTime          ExpiresAt { get; set; }
        public string            ApiUsed   { get; set; } = "yahoo";
        public string?           Warning   { get; set; }
    }

    public class CachedConfluenceResult
    {
        public List<ConfluenceSignal> Data      { get; set; } = new();
        public string                 ScannedAt { get; set; } = "";
        public DateTime               ExpiresAt { get; set; }
        public string                 ApiUsed   { get; set; } = "yahoo";
        public string?                Warning   { get; set; }
    }
}
