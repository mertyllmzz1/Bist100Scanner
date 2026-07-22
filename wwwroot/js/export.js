// export.js — Excel (SheetJS) ve PDF (jsPDF + autoTable) export
// Kütüphaneler CDN'den global olarak yüklüdür: XLSX, window.jspdf
// Normal ve confluence modlarının ikisini de destekler —
// aktif moda göre doğru varyanta yönlendirir.

import { state } from './state.js';

// ===== EXCEL EXPORT =====

export function exportExcel() {
    if (state.viewMode === 'confluence') {
        exportConfluenceExcel();
        return;
    }

    if (!state.filteredData || state.filteredData.length === 0) {
        alert('Önce tarama yapın.');
        return;
    }

    const rows = state.filteredData.filter(s => !s.errorMessage).map(s => ({
        'Sembol':            s.symbol,
        'Şirket':            s.name,
        'Fiyat (₺)':         s.currentPrice,
        'Değişim (%)':       s.changePercent,
        'Skor':              s.score,
        'Fib Golden Pocket': s.isInGoldenPocket ? 'Evet' : 'Hayır',
        'EMA20>50':          s.emaCondition    ? 'Evet' : 'Hayır',
        'MACD Crossover':    s.macdCrossover   ? 'Evet' : 'Hayır',
        'RSI 50-70':         s.rsiCondition    ? 'Evet' : 'Hayır',
        'Hacim Filtresi':    s.volumeCondition ? 'Evet' : 'Hayır',
        'RSI Değeri':        s.rsi,
        'EMA20':             s.ema20,
        'EMA50':             s.ema50,
        'EMA200':            s.ema200 || '',
        'ADX':               s.adx || '',
        'Fib 61.8':          s.fib618,
        'Golden Pocket Üst': s.goldenPocketTop,
        'Golden Pocket Alt': s.goldenPocketBottom,
        'Swing High':        s.swingHigh,
        'Swing Low':         s.swingLow,
        'Hacim':             s.volume,
        'Ort. Hacim (20g)':  s.averageVolume,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BIST Tarama');

    // Kolon genişlikleri
    ws['!cols'] = [
        {wch:8}, {wch:30}, {wch:10}, {wch:10}, {wch:6},
        {wch:16}, {wch:10}, {wch:14}, {wch:10}, {wch:14},
        {wch:10}, {wch:8}, {wch:10}, {wch:10}, {wch:10},
        {wch:8}, {wch:10}, {wch:16}, {wch:16}, {wch:12},
        {wch:12}, {wch:14}, {wch:16},
    ];

    const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    XLSX.writeFile(wb, `BIST_Tarama_${date}.xlsx`);
}

// ===== PDF EXPORT =====

export function exportPDF() {
    if (state.viewMode === 'confluence') {
        exportConfluencePDF();
        return;
    }

    if (!state.filteredData || state.filteredData.length === 0) {
        alert('Önce tarama yapın.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Başlık
    doc.setFontSize(14);
    doc.setTextColor(79, 255, 176);
    doc.text('BIST Teknik Analiz Taraması', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(120, 128, 153);
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`, 14, 21);
    doc.text(`Toplam: ${state.filteredData.filter(s => !s.errorMessage).length} hisse`, 14, 26);

    const rows = state.filteredData
        .filter(s => !s.errorMessage)
        .map(s => [
            s.symbol,
            s.name.substring(0, 22),
            `₺${s.currentPrice.toFixed(2)}`,
            `${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`,
            s.score,
            s.isInGoldenPocket ? '✓' : '✗',
            s.emaCondition     ? '✓' : '✗',
            s.macdCrossover    ? '✓' : '✗',
            s.rsiCondition     ? '✓' : '✗',
            s.volumeCondition  ? '✓' : '✗',
            s.rsi.toFixed(1),
            s.adx ? s.adx.toFixed(1) : '—',
        ]);

    doc.autoTable({
        startY: 30,
        head: [['Sembol','Şirket','Fiyat','Değişim','Skor','Fib','EMA','MACD','RSI','Hacim','RSI Val','ADX']],
        body: rows,
        styles: {
            fontSize:    7,
            cellPadding: 2,
            textColor:   [232, 234, 240],
            fillColor:   [17, 19, 24],
        },
        headStyles: {
            fillColor: [21, 24, 32],
            textColor: [79, 255, 176],
            fontStyle: 'bold',
            fontSize:  7,
        },
        alternateRowStyles: {
            fillColor: [20, 22, 28],
        },
        columnStyles: {
            0: { cellWidth: 14 },
            1: { cellWidth: 45 },
            2: { cellWidth: 18 },
            3: { cellWidth: 16 },
            4: { cellWidth: 10, halign: 'center' },
            5: { cellWidth: 8,  halign: 'center' },
            6: { cellWidth: 8,  halign: 'center' },
            7: { cellWidth: 10, halign: 'center' },
            8: { cellWidth: 8,  halign: 'center' },
            9: { cellWidth: 11, halign: 'center' },
            10:{ cellWidth: 14, halign: 'right'  },
            11:{ cellWidth: 12, halign: 'right'  },
        },
        margin: { left: 14, right: 14 },
    });

    const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    doc.save(`BIST_Tarama_${date}.pdf`);
}

// ===== CONFLUENCE EXPORT =====

function exportConfluenceExcel() {
    if (!state.confluenceData || state.confluenceData.length === 0) {
        alert('Önce confluence taraması yapın.');
        return;
    }

    const rows = state.confluenceData
        .filter(c => !c.weekly?.errorMessage)
        .map(c => ({
        'Sembol':            c.symbol,
        'Şirket':            c.name,
        'Fiyat (₺)':         c.currentPrice,
        'Değişim (%)':       c.changePercent,
        'Confluence Skor':   c.confluenceScore,
        'Alignment Bonus':   c.alignmentBonus,
        'Tam Uyum':          c.fullAlignment ? 'Evet' : 'Hayır',
        // Haftalık
        'H. Skor':           c.weekly?.score ?? '',
        'H. RSI':            c.weekly?.rsi ?? '',
        'H. EMA Koşulu':     c.weekly?.emaCondition ? 'Evet' : 'Hayır',
        'H. MACD Crossover': c.weekly?.macdCrossover ? 'Evet' : 'Hayır',
        'H. Golden Pocket':  c.weekly?.isInGoldenPocket ? 'Evet' : 'Hayır',
        'H. Hacim Filtresi': c.weekly?.volumeCondition ? 'Evet' : 'Hayır',
        'H. EMA20':          c.weekly?.ema20 ?? '',
        'H. EMA50':          c.weekly?.ema50 ?? '',
        'H. EMA200':         c.weekly?.ema200 ?? '',
        'H. ADX':            c.weekly?.adx ?? '',
        // Günlük
        'G. Skor':           c.daily?.score ?? '',
        'G. RSI':            c.daily?.rsi ?? '',
        'G. EMA Koşulu':     c.daily?.emaCondition ? 'Evet' : 'Hayır',
        'G. MACD Crossover': c.daily?.macdCrossover ? 'Evet' : 'Hayır',
        'G. Golden Pocket':  c.daily?.isInGoldenPocket ? 'Evet' : 'Hayır',
        'G. Hacim Filtresi': c.daily?.volumeCondition ? 'Evet' : 'Hayır',
        'G. EMA20':          c.daily?.ema20 ?? '',
        'G. EMA50':          c.daily?.ema50 ?? '',
        'G. EMA200':         c.daily?.ema200 ?? '',
        'G. ADX':            c.daily?.adx ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Confluence Tarama');

    ws['!cols'] = Array(28).fill({wch: 14});
    ws['!cols'][0] = {wch: 8};
    ws['!cols'][1] = {wch: 30};

    const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    XLSX.writeFile(wb, `BIST_Confluence_${date}.xlsx`);
}

function exportConfluencePDF() {
    if (!state.confluenceData || state.confluenceData.length === 0) {
        alert('Önce confluence taraması yapın.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setTextColor(255, 209, 102);
    doc.text('BIST Confluence Analizi (Haftalık + Günlük)', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(120, 128, 153);
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`, 14, 21);
    doc.text(`Toplam: ${state.confluenceData.length} hisse`, 14, 26);

    const rows = state.confluenceData
        .filter(c => !c.weekly?.errorMessage)
        .map(c => [
        c.symbol,
        c.name.substring(0, 20),
        `₺${c.currentPrice.toFixed(2)}`,
        `${c.changePercent > 0 ? '+' : ''}${c.changePercent.toFixed(2)}%`,
        c.confluenceScore,
        c.alignmentBonus > 0 ? `+${c.alignmentBonus}` : '—',
        c.fullAlignment ? '✓' : '—',
        c.weekly?.score ?? '—',
        c.weekly?.rsi?.toFixed(1) ?? '—',
        c.daily?.score ?? '—',
        c.daily?.rsi?.toFixed(1) ?? '—',
    ]);

    doc.autoTable({
        startY: 30,
        head: [['Sembol','Şirket','Fiyat','Değişim','Confluence','Bonus','Tam Uyum','H.Skor','H.RSI','G.Skor','G.RSI']],
        body: rows,
        styles: { fontSize: 7, cellPadding: 2, textColor: [232, 234, 240], fillColor: [17, 19, 24] },
        headStyles: { fillColor: [21, 24, 32], textColor: [255, 209, 102], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [20, 22, 28] },
        columnStyles: {
            0: {cellWidth: 14},  1: {cellWidth: 42},
            2: {cellWidth: 18},  3: {cellWidth: 16},
            4: {cellWidth: 18, halign: 'center'},
            5: {cellWidth: 12, halign: 'center'},
            6: {cellWidth: 14, halign: 'center'},
            7: {cellWidth: 12, halign: 'center'},
            8: {cellWidth: 12, halign: 'right'},
            9: {cellWidth: 12, halign: 'center'},
            10:{cellWidth: 12, halign: 'right'},
        },
        margin: { left: 14, right: 14 },
    });

    const date = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    doc.save(`BIST_Confluence_${date}.pdf`);
}
