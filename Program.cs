// Program.cs
// Tüm servisler artık interface üzerinden kayıtlı.
// Bir implementasyonu değiştirmek (örn. MemoryCache → Redis) sadece
// buradaki tek satırın değişmesi demek.

using Bist100Scanner.Abstractions;
using Bist100Scanner.Services;
using Bist100Scanner.Services.MarketData;
using Bist100Scanner.Services.Scoring;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

// ===== ALTYAPI (Singleton: durumsuz veya uygulama ömürlü) =====
builder.Services.AddSingleton<ICacheService, MemoryCacheService>();       // Redis günü: sadece bu satır değişir
builder.Services.AddSingleton<IFailedFetchLogger, FileFailedFetchLogger>();
builder.Services.AddSingleton<ISymbolProvider, BistSymbolService>();
builder.Services.AddSingleton<IIndicatorService, IndicatorService>();

// ===== PUANLAMA KURALLARI (Strategy pattern) =====
// Yeni kural eklemek: sınıfı yaz + buraya tek satır ekle. Başka değişiklik yok.
builder.Services.AddSingleton<IScoringRule, FibonacciGoldenPocketRule>(); // 35p
builder.Services.AddSingleton<IScoringRule, EmaTrendRule>();              // 20p
builder.Services.AddSingleton<IScoringRule, MacdCrossoverRule>();         // 20p
builder.Services.AddSingleton<IScoringRule, VolumeSurgeRule>();           // 15p
builder.Services.AddSingleton<IScoringRule, RsiRangeRule>();              // 10p
builder.Services.AddSingleton<IScoringEngine, ScoringEngine>();

// ===== VERİ SAĞLAYICILAR (Scoped: fallback durumu istek başına yaşar) =====
builder.Services.AddScoped<YahooFinanceProvider>();
builder.Services.AddScoped<TwelveDataProvider>();
builder.Services.AddScoped<IMarketDataChain, FallbackMarketDataProvider>();

// ===== ORKESTRASYON =====
builder.Services.AddScoped<IScanOrchestrator, ScanOrchestrator>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseStaticFiles();
app.UseCors();
app.UseRouting();
app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
