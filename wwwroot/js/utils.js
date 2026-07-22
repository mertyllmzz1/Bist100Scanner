// utils.js — Formatlama yardımcıları
// Birden fazla modülün kullandığı saf fonksiyonlar. DOM'a dokunmazlar.

// Fiyatı Türk formatında gösterir (1.234,56)
export function formatPrice(price) {
    if (!price) return '—';
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

// Hacmi kısaltarak gösterir (örn: 1.2M, 450K)
export function formatVolume(vol) {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toString();
}

// Koşul ikonunu döndürür (✓ / ✗)
export function condIcon(condition) {
    return condition
        ? '<span class="cond-true">✓</span>'
        : '<span class="cond-false">✗</span>';
}
