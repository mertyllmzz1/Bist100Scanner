// Services/IndicatorService.cs
// EMA, ADX, MACD, RSI, Fibonacci, Hacim DEĞERLERİNİ ve koşul bayraklarını hesaplar.
// Skender.Stock.Indicators kütüphanesini kullanır.
//
// DEĞİŞİKLİK: Puanlama (Score/ConditionsMet) artık burada DEĞİL —
// ScoringEngine'de. Bu sınıfın tek sorumluluğu indikatör hesabıdır
// (Single Responsibility). Kural eşikleri (RSI 50-70, hacim 1.2x vb.)
// serilere erişim gerektirdiği için koşul bayrakları burada hesaplanır;
// ağırlıklandırma Scoring katmanındadır.

using Skender.Stock.Indicators;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services
{
    public class IndicatorService : IIndicatorService
    {
        public void Calculate(List<OhlcvData> data, StockSignal signal)
        {
            if (data.Count < 60)
            {
                signal.ErrorMessage = "Yetersiz veri (min 60 bar)";
                return;
            }

            // Skender kütüphanesi IEnumerable<IQuote> istiyor
            var quotes = data.Select(d => new Quote
            {
                Date   = d.Date,
                Open   = (decimal)d.Open,
                High   = (decimal)d.High,
                Low    = (decimal)d.Low,
                Close  = (decimal)d.Close,
                Volume = d.Volume
            }).ToList();

            CalculateEma(quotes, signal);
            CalculateAdx(quotes, signal);
            CalculateMacd(quotes, signal);
            CalculateRsi(quotes, signal);
            CalculateVolume(data, signal);
            CalculateFibonacci(data, signal);
        }

        // EMA20 > EMA50 → kısa vadeli trend yukarı
        private static void CalculateEma(List<Quote> quotes, StockSignal signal)
        {
            var ema20  = quotes.GetEma(20).ToList();
            var ema50  = quotes.GetEma(50).ToList();
            // EMA200: uzun vadeli ana trend göstergesi
            // Yeterli bar yoksa (örn. 200'den az veri) hesaplanamayabilir
            var ema200 = quotes.GetEma(200).ToList();

            var last20  = ema20.LastOrDefault(x => x.Ema.HasValue);
            var last50  = ema50.LastOrDefault(x => x.Ema.HasValue);
            var last200 = ema200.LastOrDefault(x => x.Ema.HasValue);

            if (last20?.Ema == null || last50?.Ema == null) return;

            signal.Ema20 = Math.Round((double)last20.Ema, 2);
            signal.Ema50 = Math.Round((double)last50.Ema, 2);

            // EMA200 sadece bilgi amaçlı — puanlamaya dahil değil
            if (last200?.Ema != null)
                signal.Ema200 = Math.Round((double)last200.Ema, 2);

            signal.EmaCondition = signal.Ema20 > signal.Ema50;
        }

        // ADX: trendin gücünü ölçer (yön değil, güç)
        // ADX > 25: güçlü/belirgin trend var, < 20: yatay/kararsız
        // Sadece bilgi amaçlı — puanlamaya dahil değil
        private static void CalculateAdx(List<Quote> quotes, StockSignal signal)
        {
            var adx  = quotes.GetAdx(14).ToList();
            var last = adx.LastOrDefault(x => x.Adx.HasValue);

            if (last?.Adx != null)
                signal.Adx = Math.Round((double)last.Adx, 2);
        }

        // MACD bullish crossover: MACD line, signal line'ı aşağıdan yukarı geçti mi?
        private static void CalculateMacd(List<Quote> quotes, StockSignal signal)
        {
            var macd  = quotes.GetMacd(12, 26, 9).ToList();
            var valid = macd.Where(x => x.Macd.HasValue && x.Signal.HasValue).ToList();

            if (valid.Count < 2) return;

            var last = valid[^1];
            var prev = valid[^2];

            signal.MacdLine      = Math.Round((double)last.Macd!,           4);
            signal.MacdSignal    = Math.Round((double)last.Signal!,         4);
            signal.MacdHistogram = Math.Round((double)(last.Histogram ?? 0), 4);

            // Crossover: önceki barda MACD < Signal, şimdi MACD > Signal
            signal.MacdCrossover = prev.Macd < prev.Signal && last.Macd > last.Signal;
        }

        // RSI 50-70: momentum yükseliş yönünde, henüz aşırı alım bölgesinde değil
        private static void CalculateRsi(List<Quote> quotes, StockSignal signal)
        {
            var rsi  = quotes.GetRsi(14).ToList();
            var last = rsi.LastOrDefault(x => x.Rsi.HasValue);

            if (last?.Rsi == null) return;

            signal.Rsi          = Math.Round((double)last.Rsi, 2);
            signal.RsiCondition = signal.Rsi >= 50 && signal.Rsi <= 70;
        }

        // Hacim: son bar, 20 günlük ortalamanın %20 üzerinde mi?
        private static void CalculateVolume(List<OhlcvData> data, StockSignal signal)
        {
            if (data.Count < 20) return;

            signal.Volume          = data[^1].Volume;
            signal.AverageVolume   = (long)data.TakeLast(20).Average(d => d.Volume);
            signal.VolumeCondition = signal.Volume > signal.AverageVolume * 1.2;
        }

        // Fibonacci: son 50 barın swing high/low'undan golden pocket hesapla
        private static void CalculateFibonacci(List<OhlcvData> data, StockSignal signal)
        {
            var recent = data.TakeLast(50).ToList();

            signal.SwingHigh = recent.Max(d => d.High);
            signal.SwingLow  = recent.Min(d => d.Low);

            double range = signal.SwingHigh - signal.SwingLow;
            if (range <= 0) return;

            signal.Fib618             = Math.Round(signal.SwingHigh - range * 0.618, 2);
            signal.GoldenPocketTop    = Math.Round(signal.SwingHigh - range * 0.618, 2);
            signal.GoldenPocketBottom = Math.Round(signal.SwingHigh - range * 0.650, 2);

            // Fiyat golden pocket bölgesinde mi? (61.8% - 65% arası)
            signal.IsInGoldenPocket =
                signal.CurrentPrice >= signal.GoldenPocketBottom &&
                signal.CurrentPrice <= signal.GoldenPocketTop;
        }
    }
}
