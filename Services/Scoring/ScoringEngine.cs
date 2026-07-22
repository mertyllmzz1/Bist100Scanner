// Services/Scoring/ScoringEngine.cs
// DI'dan gelen tüm IScoringRule'ları çalıştırır ve toplam skoru hesaplar.
// Kuralların kendisini tanımaz — sadece sözleşmeyi bilir.
// Ağırlıkların toplamının 100 olması kuralların sorumluluğudur.

using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services.Scoring
{
    public class ScoringEngine : IScoringEngine
    {
        private readonly IReadOnlyList<IScoringRule> _rules;

        public ScoringEngine(
            IEnumerable<IScoringRule> rules,
            ILogger<ScoringEngine> logger)
        {
            _rules = rules.ToList();

            // Ağırlık toplamı 100 değilse geliştiriciyi uyar (uygulamayı düşürme)
            var total = _rules.Sum(r => r.Weight);
            if (total != 100)
                logger.LogWarning(
                    "Skor kurallarının ağırlık toplamı {Total}, 100 bekleniyordu.", total);
        }

        public void Apply(StockSignal signal)
        {
            int score = 0;
            int met   = 0;

            foreach (var rule in _rules)
            {
                if (rule.IsSatisfied(signal))
                {
                    score += rule.Weight;
                    met++;
                }
            }

            signal.Score            = score;
            signal.ConditionsMet    = met;
            signal.AllConditionsMet = met == _rules.Count;
        }
    }
}
