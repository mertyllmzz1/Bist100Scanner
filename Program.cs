// Program.cs

using Bist100Scanner.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

builder.Services.AddScoped<YahooFinanceService>();
builder.Services.AddScoped<TwelveDataService>();
builder.Services.AddScoped<IndicatorService>();
builder.Services.AddScoped<ScannerService>();
builder.Services.AddSingleton<BistSymbolService>();

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
