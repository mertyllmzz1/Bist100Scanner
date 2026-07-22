// table.js — Tablo render, filtreleme, sıralama, özet kartlar
// Normal ve confluence modlarının ikisini de yönetir.
// Satır tıklama olayları burada DEĞİL — main.js'te event delegation ile
// bağlanır (innerHTML her yenilendiğinde listener kaybolmasın diye).

import { state } from './state.js';
import { formatPrice, formatVolume, condIcon } from './utils.js';

// Normal modun tablo başlıkları — confluence thead'i ezdiğinde
// geri dönebilmek için sayfa açılışında saklanır.
// (Eski kodda buradaki başlıklar confluence'tan sonra geri gelmiyordu — düzeltildi)
let defaultTheadHtml = '';

export function captureDefaultThead() {
    defaultTheadHtml = document.querySelector('.scan-table thead tr').innerHTML;
}

// ===== ÖZET KARTLAR =====

export function updateSummary(result) {
    document.getElementById('totalCount').textContent = result.count;
    document.getElementById('allMetCount').textContent =
        result.data.filter(d => d.score === 100).length;
    document.getElementById('fourPlusCount').textContent =
        result.data.filter(d => d.score >= 70).length;
    document.getElementById('lastScan').textContent = result.scannedAt;

    renderCacheBadge(result);
}

export function updateConfluenceSummary(result) {
    // Geçerli sonuçlar: haftalık verisi hatasız olanlar
    const validConf = result.data.filter(d => !d.weekly?.errorMessage);
    document.getElementById('totalCount').textContent  = validConf.length;
    document.getElementById('allMetCount').textContent =
        validConf.filter(d => d.confluenceScore === 100).length;
    document.getElementById('fourPlusCount').textContent =
        validConf.filter(d => d.confluenceScore >= 70).length;
    document.getElementById('lastScan').textContent = result.scannedAt;

    renderCacheBadge(result);
}

// Cache/canlı rozetini boyar — iki modun ortak kodu
function renderCacheBadge(result) {
    const badge = document.getElementById('cacheBadge');
    if (!badge) return;

    badge.style.display = 'block';
    badge.style.background = result.fromCache ? 'rgba(255,209,102,0.15)' : 'rgba(79,255,176,0.1)';
    badge.style.color  = result.fromCache ? '#ffd166' : '#4fffb0';
    badge.style.border = result.fromCache
        ? '1px solid rgba(255,209,102,0.3)'
        : '1px solid rgba(79,255,176,0.2)';
    badge.textContent  = result.fromCache
        ? `⚡ Cache · ${result.cacheExpiresAt}'e kadar`
        : `✓ Canlı · ${result.cacheExpiresAt}'e kadar geçerli`;
}

// ===== FİLTRE + SIRALAMA (aktif moda göre yönlendirir) =====

export function applyActiveFilter() {
    if (state.viewMode === 'confluence') applyConfluenceFilter();
    else applyFilter();
}

export function sortActiveBy(key) {
    if (state.viewMode === 'confluence') sortConfluenceBy(key);
    else sortBy(key);
}

// ===== NORMAL MOD =====

export function applyFilter() {
    const filterVal = document.getElementById('filterSelect').value;
    const searchVal = document.getElementById('searchInput').value.toUpperCase().trim();

    state.filteredData = state.allData.filter(stock => {
        // Hata olan satırları filtrele
        if (stock.errorMessage) return false;

        // Skor filtresi
        if (filterVal === '5' && stock.score < 100) return false;
        if (filterVal === '4' && stock.score < 70) return false;
        if (filterVal === '3' && stock.score < 45) return false;

        // Arama filtresi
        if (searchVal && !stock.symbol.includes(searchVal) &&
            !stock.name.toUpperCase().includes(searchVal)) return false;

        return true;
    });

    // Sıralamayı koru
    sortData(state.currentSort.key, state.currentSort.dir);

    document.getElementById('resultCount').textContent =
        `${state.filteredData.length} hisse gösteriliyor`;

    renderTable();
}

export function sortBy(key) {
    // Aynı kolona tıklanınca yönü tersine çevir
    if (state.currentSort.key === key) {
        state.currentSort.dir = state.currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.currentSort.key = key;
        state.currentSort.dir = 'desc';
    }
    sortData(state.currentSort.key, state.currentSort.dir);
    renderTable();
}

function sortData(key, dir) {
    state.filteredData.sort((a, b) => {
        const valA = a[key], valB = b[key];

        if (typeof valA === 'string') {
            return dir === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        }

        return dir === 'asc' ? valA - valB : valB - valA;
    });
}

export function renderTable() {
    // Confluence thead'i ezmişse orijinal başlıkları geri yükle
    const thead = document.querySelector('.scan-table thead tr');
    if (defaultTheadHtml && thead.innerHTML !== defaultTheadHtml) {
        thead.innerHTML = defaultTheadHtml;
    }

    const tbody = document.getElementById('tableBody');

    if (state.filteredData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted)">
                    Bu filtre için sonuç bulunamadı
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = state.filteredData.map(stock => {
        if (stock.errorMessage) {
            return `
                <tr class="error-row">
                    <td><div class="symbol-code">${stock.symbol}</div></td>
                    <td colspan="13" style="color:var(--text-muted);font-size:11px">
                        ${stock.errorMessage}
                    </td>
                </tr>`;
        }

        const changeClass = stock.changePercent >= 0 ? 'change-positive' : 'change-negative';
        const changeSign  = stock.changePercent >= 0 ? '+' : '';

        // RSI rengi
        let rsiClass = 'rsi-low';
        if (stock.rsi >= 50 && stock.rsi <= 70) rsiClass = 'rsi-ok';
        else if (stock.rsi > 70) rsiClass = 'rsi-high';

        // Skor badge rengi — 100 üzerinden ağırlıklı puana göre
        let scoreClass = 'score-low';
        if (stock.score === 100)     scoreClass = 'score-5';
        else if (stock.score >= 70)  scoreClass = 'score-4';
        else if (stock.score >= 45)  scoreClass = 'score-3';

        const rowClass = stock.score === 100 ? 'all-met' : '';

        // data-symbol: main.js'teki delegation bu attribute üzerinden modal açar
        return `
            <tr class="${rowClass}" data-symbol="${stock.symbol}">
                <td>
                    <div class="symbol-code">${stock.symbol}</div>
                    <div class="symbol-name">${stock.name}</div>
                </td>
                <td><span class="price">${formatPrice(stock.currentPrice)}</span></td>
                <td>
                    <span class="${changeClass}">
                        ${changeSign}${stock.changePercent.toFixed(2)}%
                    </span>
                </td>

                <!-- Koşullar -->
                <td class="col-condition">${condIcon(stock.isInGoldenPocket)}</td>
                <td class="col-condition">${condIcon(stock.emaCondition)}</td>
                <td class="col-condition">${condIcon(stock.macdCrossover)}</td>
                <td class="col-condition">${condIcon(stock.rsiCondition)}</td>
                <td class="col-condition">${condIcon(stock.volumeCondition)}</td>

                <!-- Detay değerler -->
                <td><span class="rsi-value ${rsiClass}">${stock.rsi.toFixed(1)}</span></td>
                <td>
                    <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">
                        ${formatPrice(stock.fib618)}
                    </span>
                </td>
                <td class="col-volume">
                    <span class="volume-value">${formatVolume(stock.volume)}</span>
                    <span style="color:var(--text-muted);font-size:10px"> / ${formatVolume(stock.averageVolume)}</span>
                </td>
                <td class="col-ema200">
                    <span class="ema200-value">${stock.ema200 ? formatPrice(stock.ema200) : '—'}</span>
                </td>
                <td class="col-adx">
                    <span class="adx-value ${stock.adx >= 25 ? 'adx-strong' : 'adx-weak'}">
                        ${stock.adx ? stock.adx.toFixed(1) : '—'}
                    </span>
                </td>

                <!-- Skor -->
                <td><span class="score-badge ${scoreClass}">${stock.score}</span></td>
            </tr>`;
    }).join('');
}

// ===== CONFLUENCE MODU =====

export function applyConfluenceFilter() {
    if (!state.confluenceData) return;

    const filterVal = document.getElementById('filterSelect').value;
    const searchVal = document.getElementById('searchInput').value.toUpperCase().trim();

    const filtered = state.confluenceData.filter(c => {
        // Sadece haftalık veri hatası varsa eleriz — günlük hata olsa bile gösteririz
        if (c.weekly?.errorMessage) return false;

        if (filterVal === '5' && c.confluenceScore < 100) return false;
        if (filterVal === '4' && c.confluenceScore < 70)  return false;
        if (filterVal === '3' && c.confluenceScore < 45)  return false;

        if (searchVal && !c.symbol.includes(searchVal) &&
            !c.name.toUpperCase().includes(searchVal)) return false;

        return true;
    });

    document.getElementById('resultCount').textContent = `${filtered.length} hisse gösteriliyor`;
    renderConfluenceTable(filtered);
}

export function sortConfluenceBy(key) {
    if (!state.confluenceData) return;
    state.confluenceData.sort((a, b) => {
        const va = key === 'symbol' ? a.symbol : (a[key] ?? 0);
        const vb = key === 'symbol' ? b.symbol : (b[key] ?? 0);
        return typeof va === 'string' ? va.localeCompare(vb) : vb - va;
    });
    applyConfluenceFilter();
}

function renderConfluenceTable(data) {
    const tbody = document.getElementById('tableBody');

    // Confluence'a özel tablo başlıkları
    // data-sort: main.js'teki delegation sıralamayı bu attribute'tan okur
    const thead = document.querySelector('.scan-table thead tr');
    thead.innerHTML = `
        <th data-sort="symbol">Hisse <span class="sort-icon">⇅</span></th>
        <th data-sort="currentPrice">Fiyat <span class="sort-icon">⇅</span></th>
        <th data-sort="changePercent">Değişim <span class="sort-icon">⇅</span></th>
        <th class="has-tooltip" data-tooltip="Haftalık grafikte teknik skor (0-100). Ağırlık: %60">
            <div class="th-label">Haftalık</div><div class="th-sub">Skor</div>
        </th>
        <th class="has-tooltip" data-tooltip="Günlük grafikte teknik skor (0-100). Ağırlık: %40">
            <div class="th-label">Günlük</div><div class="th-sub">Skor</div>
        </th>
        <th class="has-tooltip" data-tooltip="Her iki timeframe'de aynı koşullar sağlandığında kazanılan bonus puan (+5 EMA, +5 MACD, +8 Golden Pocket, +3 RSI, +4 Hacim)">
            <div class="th-label">Bonus</div><div class="th-sub">Alignment</div>
        </th>
        <th data-sort="confluenceScore" class="has-tooltip" data-tooltip="Birleşik skor: Haftalık %60 + Günlük %40 + Alignment bonusu. Ne kadar yüksekse iki timeframe o kadar uyumlu.">
            Confluence <span class="sort-icon">⇅</span>
        </th>
        <th class="has-tooltip" data-tooltip="Haftalık RSI değeri">H.RSI</th>
        <th class="has-tooltip" data-tooltip="Günlük RSI değeri">G.RSI</th>
        <th class="has-tooltip" data-tooltip="Her iki timeframe'de EMA dizilimi düzgün ve RSI 50-75 arasında mı?">Tam Uyum</th>
    `;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">Sonuç bulunamadı</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(c => {
        const changeClass = c.changePercent >= 0 ? 'change-positive' : 'change-negative';
        const changeSign  = c.changePercent >= 0 ? '+' : '';

        const wScore = c.weekly?.score ?? 0;
        const dScore = c.daily?.score  ?? 0;

        const scoreColor = (s) => s >= 70 ? 'var(--green)' : s >= 45 ? 'var(--yellow)' : 'var(--text-muted)';

        const cScore = c.confluenceScore;
        const cClass = cScore >= 80 ? 'score-5' : cScore >= 60 ? 'score-4' : cScore >= 40 ? 'score-3' : 'score-low';

        const rowClass = c.fullAlignment ? 'all-met' : '';

        return `
            <tr class="${rowClass}" data-symbol="${c.symbol}">
                <td>
                    <div class="symbol-code">${c.symbol}</div>
                    <div class="symbol-name">${c.name}</div>
                </td>
                <td><span class="price">₺${formatPrice(c.currentPrice)}</span></td>
                <td><span class="${changeClass}">${changeSign}${c.changePercent.toFixed(2)}%</span></td>
                <td style="text-align:center">
                    <span style="font-family:var(--font-mono);font-weight:700;color:${scoreColor(wScore)}">${wScore}</span>
                </td>
                <td style="text-align:center">
                    <span style="font-family:var(--font-mono);font-weight:700;color:${scoreColor(dScore)}">${c.daily ? dScore : '—'}</span>
                </td>
                <td style="text-align:center">
                    <span style="font-family:var(--font-mono);font-size:12px;color:${c.alignmentBonus > 0 ? 'var(--yellow)' : 'var(--text-muted)'}">
                        ${c.alignmentBonus > 0 ? '+' + c.alignmentBonus : '—'}
                    </span>
                </td>
                <td style="text-align:center">
                    <span class="score-badge ${cClass}">${cScore}</span>
                </td>
                <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:${c.weekly?.rsi >= 50 && c.weekly?.rsi <= 70 ? 'var(--green)' : 'var(--text-secondary)'}">
                    ${c.weekly?.rsi?.toFixed(1) ?? '—'}
                </td>
                <td style="text-align:right;font-family:var(--font-mono);font-size:12px;color:${c.daily?.rsi >= 50 && c.daily?.rsi <= 75 ? 'var(--green)' : 'var(--text-secondary)'}">
                    ${c.daily?.rsi?.toFixed(1) ?? '—'}
                </td>
                <td style="text-align:center">
                    ${c.fullAlignment
                        ? '<span class="full-alignment-badge">TAM UYUM</span>'
                        : '<span style="color:var(--text-muted);font-size:11px">—</span>'}
                </td>
            </tr>`;
    }).join('');
}
