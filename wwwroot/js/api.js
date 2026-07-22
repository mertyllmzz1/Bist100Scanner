// api.js — Backend ile tüm iletişim bu modülden geçer
// Endpoint adresleri ve fetch detayları tek yerde:
// API değişirse sadece bu dosya güncellenir.

// Tarama başlatır. interval 'confluence' ise çift tarama endpoint'i kullanılır.
// Başarısızlıkta Error fırlatır — çağıran taraf yakalar.
export async function runScan(interval, apiSource, twelveApiKey) {
    const endpoint = interval === 'confluence'
        ? '/api/scanner/confluence'
        : '/api/scanner/scan';

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, apiSource, twelveApiKey })
    });

    if (!response.ok) {
        throw new Error(`Sunucu hatası: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.message || 'Bilinmeyen hata');
    }

    return result;
}

// Grafik verisi çeker (mumlar + EMA + Fibonacci seviyeleri)
export async function fetchChart(symbol, interval) {
    const response = await fetch(`/api/scanner/chart/${symbol}?interval=${interval}`);
    if (!response.ok) throw new Error('Grafik verisi alınamadı');
    return response.json();
}
