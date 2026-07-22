// Services/FileFailedFetchLogger.cs
// Veri alınamayan hisseleri günlük dosyaya yazar:
//   logs/failed-symbols-2026-07-22.log
//
// Satır formatı:
//   2026-07-22 14:31:05 | PASEU.IS | yahoo      | NotFound     | 404
//   2026-07-22 14:31:12 | THYAO.IS | twelvedata | RateLimited  | TWELVE_DATA_LIMIT_EXCEEDED
//
// Tarama paralel çalıştığı için SemaphoreSlim ile yazma serileştirilir —
// satırlar birbirine karışmaz. Singleton olarak kayıtlıdır.
// İleride Serilog'a geçilirse sadece bu sınıf değişir.

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Bist100Scanner.Abstractions;
using Bist100Scanner.Models;

namespace Bist100Scanner.Services
{
    public class FileFailedFetchLogger : IFailedFetchLogger
    {
        private readonly string _logDirectory;
        private readonly ILogger<FileFailedFetchLogger> _logger;

        // Aynı anda tek yazma — paralel taramada satır karışmasını önler
        private static readonly SemaphoreSlim WriteLock = new(1, 1);

        public FileFailedFetchLogger(
            IHostEnvironment env,
            ILogger<FileFailedFetchLogger> logger)
        {
            _logDirectory = Path.Combine(env.ContentRootPath, "logs");
            _logger       = logger;
        }

        public async Task LogAsync(
            string symbol, string provider,
            FetchFailureReason reason, string? message = null)
        {
            var line = string.Format(
                "{0:yyyy-MM-dd HH:mm:ss} | {1,-10} | {2,-10} | {3,-16} | {4}{5}",
                DateTime.Now, symbol, provider, reason, message ?? "-", Environment.NewLine);

            var path = Path.Combine(
                _logDirectory, $"failed-symbols-{DateTime.Now:yyyy-MM-dd}.log");

            await WriteLock.WaitAsync();
            try
            {
                Directory.CreateDirectory(_logDirectory);
                await File.AppendAllTextAsync(path, line);
            }
            catch (Exception ex)
            {
                // Log dosyası yazılamıyorsa taramayı düşürme — sadece konsola bildir
                _logger.LogWarning(ex, "Failed-fetch log dosyasına yazılamadı: {Path}", path);
            }
            finally
            {
                WriteLock.Release();
            }
        }
    }
}
