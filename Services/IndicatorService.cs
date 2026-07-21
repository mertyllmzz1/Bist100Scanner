// Services/IndicatorService.cs
// EMA, MACD, RSI, Fibonacci, Hacim hesaplar
// Skender.Stock.Indicators kütüphanesini kullanır

using Skender.Stock.Indicators;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services
{
    public class IndicatorService
    {
        // Ana metod: OHLCV verisinden tüm indikatörleri hesaplar
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

            // Kaç koşul sağlandı (filtreleme için)
            signal.ConditionsMet =
                (signal.EmaCondition     ? 1 : 0) +
                (signal.MacdCrossover    ? 1 : 0) +
                (signal.RsiCondition     ? 1 : 0) +
                (signal.VolumeCondition  ? 1 : 0) +
                (signal.IsInGoldenPocket ? 1 : 0);

            signal.AllConditionsMet = signal.ConditionsMet == 5;

            // Ağırlıklı 100 üzerinden puan:
            // Fibonacci G.P.   → 35 (profesyonellerin en çok izlediği giriş bölgesi)
            // EMA20 > EMA50    → 20 (trend yönü)
            // MACD Crossover   → 20 (momentum tetikleyici)
            // Hacim filtresi   → 15 (hareketin gerçekliği)
            // RSI 50-70        → 10 (momentum doğrulama)
            signal.Score =
                (signal.IsInGoldenPocket ? 35 : 0) +
                (signal.EmaCondition     ? 20 : 0) +
                (signal.MacdCrossover    ? 20 : 0) +
                (signal.VolumeCondition  ? 15 : 0) +
                (signal.RsiCondition     ? 10 : 0);
        }

        // EMA20 > EMA50 → kısa vadeli trend yukarı
        private void CalculateEma(List<Quote> quotes, StockSignal signal)
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
        // ADX > 25: güçlü/belirgin trend var
        // ADX < 20: trend yok, fiyat yatay/kararsız
        // Sadece bilgi amaçlı — puanlamaya dahil değil
        private void CalculateAdx(List<Quote> quotes, StockSignal signal)
        {
            var adx  = quotes.GetAdx(14).ToList();
            var last = adx.LastOrDefault(x => x.Adx.HasValue);

            if (last?.Adx != null)
                signal.Adx = Math.Round((double)last.Adx, 2);
        }

        // MACD bullish crossover: MACD line, signal line'ı aşağıdan yukarı geçti mi?
        private void CalculateMacd(List<Quote> quotes, StockSignal signal)
        {
            var macd   = quotes.GetMacd(12, 26, 9).ToList();
            var valid  = macd.Where(x => x.Macd.HasValue && x.Signal.HasValue).ToList();

            if (valid.Count < 2) return;

            var last = valid[^1];
            var prev = valid[^2];

            signal.MacdLine      = Math.Round((double)last.Macd!,      4);
            signal.MacdSignal    = Math.Round((double)last.Signal!,     4);
            signal.MacdHistogram = Math.Round((double)(last.Histogram ?? 0), 4);

            // Crossover: önceki barda MACD < Signal, şimdi MACD > Signal
            signal.MacdCrossover = prev.Macd < prev.Signal && last.Macd > last.Signal;
        }

        // RSI 50-70: momentum yükseliş yönünde, henüz aşırı alım bölgesinde değil
        private void CalculateRsi(List<Quote> quotes, StockSignal signal)
        {
            var rsi  = quotes.GetRsi(14).ToList();
            var last = rsi.LastOrDefault(x => x.Rsi.HasValue);

            if (last?.Rsi == null) return;

            signal.Rsi         = Math.Round((double)last.Rsi, 2);
            signal.RsiCondition = signal.Rsi >= 50 && signal.Rsi <= 70;
        }

        // Hacim: son bar ortalamanın %20 üzerinde mi?
        private void CalculateVolume(List<OhlcvData> data, StockSignal signal)
        {
            if (data.Count < 20) return;

            signal.Volume        = data[^1].Volume;
            signal.AverageVolume = (long)data.TakeLast(20).Average(d => d.Volume);
            signal.VolumeCondition = signal.Volume > signal.AverageVolume * 1.2;
        }

        // Fibonacci: son 50 barın swing high/low'undan golden pocket hesapla
        private void CalculateFibonacci(List<OhlcvData> data, StockSignal signal)
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
