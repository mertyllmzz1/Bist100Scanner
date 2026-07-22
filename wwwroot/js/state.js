// state.js — Uygulamanın tek doğruluk kaynağı
// Tüm modüller (table, chart, export...) durumu buradan okur/yazar.
// Global değişken kirliliği yerine tek bir export edilen nesne.

export const state = {
    allData: [],            // Normal tarama sonuçları
    filteredData: [],       // Filtreden geçen sonuçlar
    confluenceData: null,   // Confluence tarama sonuçları

    currentSort: { key: 'score', dir: 'desc' },

    selectedInterval: 'daily',   // daily | weekly | monthly | confluence

    // Hangi tablo görünümü aktif? Tarama sonucu geldiğinde set edilir.
    // Sıralama/filtre olayları buna göre doğru fonksiyona yönlenir.
    viewMode: 'normal',          // normal | confluence

    // Modal / grafik durumu
    currentSymbol: null,
    currentChartInterval: '1d',
};
