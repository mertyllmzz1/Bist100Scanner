// Services/Scoring/ScoringRules.cs
// Strategy pattern: her puanlama kriteri kendi sınıfında.
//
// Yeni kural eklemek için:
//   1. Bu dosyaya (veya yeni dosyaya) IScoringRule implementasyonu ekle
//   2. Program.cs'e tek satır DI kaydı ekle
// Mevcut hiçbir koda dokunulmaz (Open/Closed prensibi).
//
// Kurallar, IndicatorService'in hesapladığı koşul bayraklarını okur.
// Ağırlıklar artık IndicatorService içine gömülü değil — her kuralın
// kendi Weight'i var, toplamları 100.

using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services.Scoring
{
    // Fiyat, son swing'in %61.8–%65 geri çekilme bölgesinde
    // Profesyonellerin en çok izlediği giriş bölgesi
    public class FibonacciGoldenPocketRule : IScoringRule
    {
        public string Name   => "Fibonacci Golden Pocket";
        public int    Weight => 35;
        public bool IsSatisfied(StockSignal signal) => signal.IsInGoldenPocket;
    }

    // EMA20 > EMA50 — kısa vadeli trend, orta vadeli trendin üzerinde
    public class EmaTrendRule : IScoringRule
    {
        public string Name   => "EMA20 > EMA50";
        public int    Weight => 20;
        public bool IsSatisfied(StockSignal signal) => signal.EmaCondition;
    }

    // MACD çizgisi sinyal çizgisini yukarı kesti — momentum tetikleyici
    public class MacdCrossoverRule : IScoringRule
    {
        public string Name   => "MACD Bullish Crossover";
        public int    Weight => 20;
        public bool IsSatisfied(StockSignal signal) => signal.MacdCrossover;
    }

    // Hacim son 20 gün ortalamasının 1.2 katı üzerinde — hareketin gerçekliği
    public class VolumeSurgeRule : IScoringRule
    {
        public string Name   => "Hacim Ortalamanın Üzeri";
        public int    Weight => 15;
        public bool IsSatisfied(StockSignal signal) => signal.VolumeCondition;
    }

    // RSI 50–70 — momentum yukarı yönlü, henüz aşırı alımda değil
    public class RsiRangeRule : IScoringRule
    {
        public string Name   => "RSI 50-70";
        public int    Weight => 10;
        public bool IsSatisfied(StockSignal signal) => signal.RsiCondition;
    }
}
