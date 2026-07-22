// Services/ScanOrchestrator.cs
// Eski ScannerService'in yerini alan orkestratör.
//
// Sorumluluğu SADECE akış: sembolleri al → veriyi çek → indikatörleri
// hesapla → skorla → sonuçları topla. Veri kaynağı seçimi/fallback zincirde,
// hesaplama IndicatorService'te, puanlama ScoringEngine'de, sembol listesi
// SymbolProvider'da. Alt servisler birbirini ve orkestratörü tanımaz —
// bağımlılık yönü tek taraflı yukarıdan aşağıya (Dependency Inversion).

using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services
{
	public class ScanOrchestrator : IScanOrchestrator
	{
		private readonly IMarketDataChain _marketData;
		private readonly IIndicatorService _indicatorService;
		private readonly IScoringEngine _scoringEngine;
		private readonly ISymbolProvider _symbolProvider;
		private readonly IFailedFetchLogger _failLogger;
		private readonly ILogger<ScanOrchestrator> _logger;

		public ScanOrchestrator(
			IMarketDataChain marketData,
			IIndicatorService indicatorService,
			IScoringEngine scoringEngine,
			ISymbolProvider symbolProvider,
			IFailedFetchLogger failLogger,
			ILogger<ScanOrchestrator> logger)
		{
			_marketData = marketData;
			_indicatorService = indicatorService;
			_scoringEngine = scoringEngine;
			_symbolProvider = symbolProvider;
			_failLogger = failLogger;
			_logger = logger;
		}

		public async Task<ScanOutcome> ScanAllAsync(
			string interval, string apiSource, string? twelveApiKey)
		{
			var symbols = await _symbolProvider.GetAllSymbolsAsync();
			_logger.LogInformation(
				"Taranacak hisse: {Count}, Kaynak: {Source}", symbols.Count, apiSource);

			var context = BuildContext(interval, apiSource, twelveApiKey);

			// Twelve Data'nın dakikalık limiti daha sıkı → paralellik düşük tutulur
			bool useTwelve = apiSource == "twelvedata" && !string.IsNullOrEmpty(twelveApiKey);
			int parallelism = useTwelve ? 5 : 10;
			var semaphore = new SemaphoreSlim(parallelism, parallelism);

			var tasks = symbols.Select(async s =>
			{
				await semaphore.WaitAsync();
				try
				{
					return await ScanSingleAsync(s.Symbol, s.Name, context);
				}
				finally
				{
					semaphore.Release();
					// Rate limit'e karşı istekler arasına küçük gecikme
					await Task.Delay(useTwelve ? 150 : 80);
				}
			});

			var results = await Task.WhenAll(tasks);

			return new ScanOutcome(
				results.OrderByDescending(r => r.Score)
					   .ThenByDescending(r => r.ConditionsMet)
					   .ToList(),
				_marketData.FallbackOccurred ? "yahoo (fallback)" : apiSource,
				_marketData.FallbackWarning);
		}

		// Haftalık + Günlük çift tarama — confluence analizi
		public async Task<ConfluenceOutcome> ScanConfluenceAsync(
			string apiSource, string? twelveApiKey)
		{
			_logger.LogInformation("Çift tarama başladı (Haftalık + Günlük)");

			var weeklyTask = ScanAllAsync("1wk", apiSource, twelveApiKey);
			var dailyTask = ScanAllAsync("1d", apiSource, twelveApiKey);

			await Task.WhenAll(weeklyTask, dailyTask);

			var weekly = await weeklyTask;
			var daily = await dailyTask;

			var dailyMap = daily.Results
				.Where(r => r.ErrorMessage == null)
				.ToDictionary(r => r.Symbol, r => r);

			var confluence = weekly.Results
				.Where(w => w.ErrorMessage == null)
				.Select(w =>
				{
					dailyMap.TryGetValue(w.Symbol, out var d);

					// Günlük veri hatalıysa skor hesabında yok say ama hisseyi
					// listeden çıkarma — haftalık skoru göster
					var validDaily = (d?.ErrorMessage == null) ? d : null;

					int confluenceScore = validDaily != null
						? (int)(w.Score * 0.6 + validDaily.Score * 0.4)
						: w.Score;

					int bonus = 0;
					if (validDaily != null)
					{
						if (w.EmaCondition && validDaily.EmaCondition) bonus += 5;
						if (w.MacdCrossover && validDaily.MacdCrossover) bonus += 5;
						if (w.IsInGoldenPocket && validDaily.IsInGoldenPocket) bonus += 8;
						if (w.RsiCondition && validDaily.RsiCondition) bonus += 3;
						if (w.VolumeCondition && validDaily.VolumeCondition) bonus += 4;
					}

					return new ConfluenceSignal
					{
						Symbol = w.Symbol,
						Name = w.Name,
						CurrentPrice = w.CurrentPrice,
						ChangePercent = w.ChangePercent,
						Weekly = w,
						Daily = validDaily,
						ConfluenceScore = Math.Min(confluenceScore + bonus, 100),
						AlignmentBonus = bonus,
						FullAlignment = validDaily != null &&
										  w.EmaCondition && validDaily.EmaCondition &&
										  w.Rsi > 50 && validDaily.Rsi is > 50 and < 75
					};
				})
				.OrderByDescending(c => c.ConfluenceScore)
				.ThenByDescending(c => c.AlignmentBonus)
				.ToList();

			return new ConfluenceOutcome(
				confluence,
				weekly.ApiUsed,
				weekly.Warning ?? daily.Warning);
		}

		// Tek bir hisseyi tarar: veri çek → indikatör hesapla → skorla
		private async Task<StockSignal> ScanSingleAsync(
			string symbol, string name, ScanContext context)
		{
			var signal = new StockSignal
			{
				Symbol = symbol.Replace(".IS", ""),
				Name = name
			};

			try
			{
				var fetch = await _marketData.GetHistoricalDataAsync(symbol, context);

				if (!fetch.Success)
				{
					// Detaylı hata dosyaya zaten yazıldı (zincir logladı);
					// kullanıcıya sade mesaj göster
					signal.ErrorMessage = "Veri alınamadı";
					return signal;
				}

				// Haftalık/aylıkta henüz kapanmamış son barı at:
				// Yarım bar her gün değiştiği için skorlar gün aşırı savruluyordu.
				// Günlükte son bar korunur — "bugünün resmi" istenen davranış.
				var data = TrimIncompleteLastBar(fetch.Data, context.Interval);

				if (data.Count == 0)
				{
					signal.ErrorMessage = "Veri alınamadı";
					return signal;
				}

				// Yahoo'nun doğrulanmış hisse adı listedeki (boş) ismin üzerine yazılır
				if (!string.IsNullOrEmpty(data[0].ShortName))
					signal.Name = data[0].ShortName;

				signal.CurrentPrice = Math.Round(data[^1].Close, 2);

				if (data.Count >= 2)
				{
					double prev = data[^2].Close;
					signal.ChangePercent = Math.Round(
						((signal.CurrentPrice - prev) / prev) * 100, 2);
				}

				_indicatorService.Calculate(data, signal);

				// Veri geldi ama indikatör hesabı için yetersizse bunu da dosyaya yaz
				if (signal.ErrorMessage != null)
				{
					await _failLogger.LogAsync(symbol, fetch.Provider,
						FetchFailureReason.InsufficientData, signal.ErrorMessage);
					return signal;
				}

				_scoringEngine.Apply(signal);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Tarama hatası: {Symbol}", symbol);
				await _failLogger.LogAsync(symbol, _marketData.Name,
					FetchFailureReason.Unknown, ex.Message);
				signal.ErrorMessage = ex.Message;
			}

			return signal;
		}

		// Henüz kapanmamış son barı skorlama verisinden çıkarır.
		//
		// Neden: Haftalık/aylık son bar oluşmayı bitirmeden döner (Salı günü
		// "haftalık" son bar 2 günlük veridir). Skorlanan 5 koşulun hepsi son
		// bara baktığı için yarım bar, skorların gün aşırı savrulmasına neden
		// oluyordu. Klasik TA kuralı: sinyal, bar KAPANIŞIYLA teyit edilir.
		//
		// Kurallar:
		//   1d  → dokunma (günlük bar "bugünün resmi", bilinçli tercih)
		//   1wk → barın haftası bitmemişse at. Bar tarihi Pazartesi'dir;
		//         Cuma seansı geçtiyse (bugün > Pzt+4) hafta kapanmış sayılır.
		//         Böylece hafta sonu taramalarında yeni kapanan hafta geçerlidir.
		//   1mo → barın ayı hâlâ içinde bulunduğumuz aysa at.
		private static List<OhlcvData> TrimIncompleteLastBar(
			List<OhlcvData> data, string interval)
		{
			if (data.Count == 0) return data;
			if (interval != "1wk" && interval != "1mo") return data;

			var lastBar = data[^1];
			var today = DateTime.UtcNow.Date;

			bool lastBarIncomplete = interval switch
			{
				// Haftalık: bar Pazartesi damgalı → Cuma = Pzt+4.
				// Bugün Cuma'dan ileri değilse hafta hâlâ oluşuyor demektir.
				"1wk" => today <= lastBar.Date.Date.AddDays(4),

				// Aylık: bar, içinde bulunduğumuz aya aitse oluşuyor demektir.
				"1mo" => lastBar.Date.Year == today.Year &&
						 lastBar.Date.Month == today.Month,

				_ => false
			};

			if (!lastBarIncomplete) return data;

			// Orijinal listeyi değiştirme — cache'lenmiş veri paylaşımlı olabilir
			return data.Take(data.Count - 1).ToList();
		}

		// Interval'a göre veri penceresi: Yahoo gün sayısı + TwelveData bar sayısı
		private static ScanContext BuildContext(
			string interval, string apiSource, string? twelveApiKey)
		{
			int days = interval switch
			{
				"1wk" => 365 * 5,
				"1mo" => 365 * 20,
				_ => 365 * 2
			};

			int outputSize = interval switch
			{
				"1wk" => 260,
				"1mo" => 240,
				_ => 500
			};

			return new ScanContext(interval, days, outputSize, apiSource, twelveApiKey);
		}
	}
}