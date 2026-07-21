// Models/StockSignal.cs

namespace Bist100Scanner.Models
{
    public class StockSignal
    {
        public string Symbol        { get; set; } = "";
        public string Name          { get; set; } = "";
        public double CurrentPrice  { get; set; }
        public double ChangePercent { get; set; }

        // Fibonacci
        public double SwingHigh           { get; set; }
        public double SwingLow            { get; set; }
        public double Fib618              { get; set; }
        public double GoldenPocketTop     { get; set; }
        public double GoldenPocketBottom  { get; set; }
        public bool   IsInGoldenPocket    { get; set; }

        // EMA
        public double Ema20         { get; set; }
        public double Ema50         { get; set; }
        public double Ema200        { get; set; }
        public bool   EmaCondition  { get; set; }

        // ADX
        public double Adx           { get; set; }

        // MACD
        public double MacdLine      { get; set; }
        public double MacdSignal    { get; set; }
        public double MacdHistogram { get; set; }
        public bool   MacdCrossover { get; set; }

        // RSI
        public double Rsi           { get; set; }
        public bool   RsiCondition  { get; set; }

        // Hacim
        public long   Volume          { get; set; }
        public long   AverageVolume   { get; set; }
        public bool   VolumeCondition { get; set; }

        // Sonuç
        public int  ConditionsMet    { get; set; }
        public bool AllConditionsMet { get; set; }
        public int  Score            { get; set; }

        public string? ErrorMessage  { get; set; }
    }

    public class ScanRequest
    {
        public string  Interval      { get; set; } = "daily";
        public string  ApiSource     { get; set; } = "yahoo";      // "yahoo" | "twelvedata"
        public string? TwelveApiKey  { get; set; }                 // Twelve Data key
    }
}
