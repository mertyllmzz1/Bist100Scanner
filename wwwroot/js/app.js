// app.js - Frontend mantığı
// API'den veri çeker, tabloyu oluşturur, filtreler, sıralar

// ===== DURUM YÖNETİMİ =====
let allData = [];          // Tüm tarama sonuçları
let filteredData = [];     // Filtreden geçen sonuçlar
let currentSort = { key: 'score', dir: 'desc' };  // Aktif sıralama
let selectedInterval = 'daily';  // Seçili zaman dilimi

// ===== ZAMAN DİLİMİ SEÇİMİ =====
document.querySelectorAll('.interval-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Aktif butonu güncelle
        document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedInterval = btn.dataset.interval;
    });
});

// ===== TARAMA BAŞLAT =====
async function startScan() {
    const btn = document.getElementById('scanBtn');
    const statusBar = document.getElementById('statusBar');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Taranıyor...';
    statusBar.style.display = 'block';

    // Confluence modunda iki tarama aynı anda yapılıyor, biraz daha uzun sürebilir
    document.getElementById('statusText').textContent = selectedInterval === 'confluence'
        ? 'Haftalık + Günlük çift tarama yapılıyor...'
        : 'BİST hisseleri taranıyor...';
    document.querySelector('.status-note').textContent = selectedInterval === 'confluence'
        ? 'Bu işlem ~3-4 dakika sürebilir (iki tarama paralel)'
        : 'Bu işlem ~1-2 dakika sürebilir';

    document.getElementById('tableWrapper').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';

    try {
        const apiSource    = localStorage.getItem('apiSource') || 'yahoo';
        const twelveApiKey = localStorage.getItem('twelveApiKey') || '';

        // Confluence modu için ayrı endpoint
        const endpoint = selectedInterval === 'confluence'
            ? '/api/scanner/confluence'
            : '/api/scanner/scan';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                interval:     selectedInterval,
                apiSource:    apiSource,
                twelveApiKey: twelveApiKey
            })
        });

        if (!response.ok) {
            throw new Error(`Sunucu hatası: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Bilinmeyen hata');
        }

        // Veriyi sakla ve tabloyu güncelle
        // Confluence modunda data farklı formatta — ConfluenceSignal listesi
        if (selectedInterval === 'confluence') {
            confluenceData = result.data;
            allData = [];
            updateConfluenceSummary(result);
            applyConfluenceFilter();
        } else {
            confluenceData = null;
            allData = result.data;
            updateSummary(result);
            applyFilter();
        }

        // Twelve Data → Yahoo fallback olduysa uyar
        if (result.warning) showApiWarning(result.warning);

        // Export butonlarını göster
        document.getElementById('exportGroup').style.display = 'flex';

        // Filtre ve tablo göster
        document.getElementById('filterRow').style.display = 'flex';
        document.getElementById('summaryRow').style.display = 'grid';
        document.getElementById('tableWrapper').style.display = 'block';

    } catch (error) {
        // Hata durumunda kullanıcıya bildir
        alert(`Tarama hatası: ${error.message}`);
        document.getElementById('emptyState').style.display = 'block';
        console.error('Tarama hatası:', error);
    } finally {
        // Her durumda buton ve durumu sıfırla
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">Tara</span>';
        statusBar.style.display = 'none';
    }
}

// ===== ÖZET KARTLARI GÜNCELLE =====
function updateSummary(result) {
    document.getElementById('totalCount').textContent = result.count;
    document.getElementById('allMetCount').textContent =
        result.data.filter(d => d.score === 100).length;
    document.getElementById('fourPlusCount').textContent =
        result.data.filter(d => d.score >= 70).length;
    document.getElementById('lastScan').textContent = result.scannedAt;

    // Cache durumunu göster
    const badge = document.getElementById('cacheBadge');
    if (badge) {
        if (result.fromCache) {
            // Cache'ten geldi — sarı rozet
            badge.style.display = 'block';
            badge.style.background = 'rgba(255,209,102,0.15)';
            badge.style.color = '#ffd166';
            badge.style.border = '1px solid rgba(255,209,102,0.3)';
            badge.textContent = `⚡ Cache · ${result.cacheExpiresAt}'e kadar`;
        } else {
            // Taze tarama — yeşil rozet
            badge.style.display = 'block';
            badge.style.background = 'rgba(79,255,176,0.1)';
            badge.style.color = '#4fffb0';
            badge.style.border = '1px solid rgba(79,255,176,0.2)';
            badge.textContent = `✓ Canlı · ${result.cacheExpiresAt}'e kadar geçerli`;
        }
    }
}

// ===== FİLTRE UYGULA =====
function applyFilter() {
    // Confluence modunda kendi filter fonksiyonu devreye girer
    if (selectedInterval === 'confluence') {
        applyConfluenceFilter();
        return;
    }

    const filterVal = document.getElementById('filterSelect').value;
    const searchVal = document.getElementById('searchInput').value.toUpperCase().trim();

    filteredData = allData.filter(stock => {
        // Hata olan satırları filtrele
        if (stock.errorMessage) return false;

        // Koşul filtresi
        if (filterVal === '5' && stock.score < 100) return false;
        if (filterVal === '4' && stock.score < 70) return false;
        if (filterVal === '3' && stock.score < 45) return false;

        // Arama filtresi
        if (searchVal && !stock.symbol.includes(searchVal) &&
            !stock.name.toUpperCase().includes(searchVal)) return false;

        return true;
    });

    // Sıralamayı koru
    sortData(currentSort.key, currentSort.dir);

    document.getElementById('resultCount').textContent =
        `${filteredData.length} hisse gösteriliyor`;

    renderTable();
}

// ===== SIRALA =====
function sortBy(key) {
    // Aynı kolona tıklanınca yönü tersine çevir
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'desc';
    }
    sortData(currentSort.key, currentSort.dir);
    renderTable();
}

function sortData(key, dir) {
    filteredData.sort((a, b) => {
        let valA = a[key], valB = b[key];

        // String karşılaştırma
        if (typeof valA === 'string') {
            return dir === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        }

        // Sayısal karşılaştırma
        return dir === 'asc' ? valA - valB : valB - valA;
    });
}

// ===== TABLO RENDER =====
function renderTable() {
    const tbody = document.getElementById('tableBody');

    if (filteredData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted)">
                    Bu filtre için sonuç bulunamadı
                </td>
            </tr>`;
        return;
    }

    // Her hisse için bir satır oluştur
    tbody.innerHTML = filteredData.map(stock => {
        if (stock.errorMessage) {
            // Hata olan satır
            return `
                <tr class="error-row">
                    <td><div class="symbol-code">${stock.symbol}</div></td>
                    <td colspan="13" style="color:var(--text-muted);font-size:11px">
                        ${stock.errorMessage}
                    </td>
                </tr>`;
        }

        // Değişim rengi
        const changeClass = stock.changePercent >= 0 ? 'change-positive' : 'change-negative';
        const changeSign = stock.changePercent >= 0 ? '+' : '';

        // RSI rengi
        let rsiClass = 'rsi-low';
        if (stock.rsi >= 50 && stock.rsi <= 70) rsiClass = 'rsi-ok';
        else if (stock.rsi > 70) rsiClass = 'rsi-high';

        // Skor badge rengi — 100 üzerinden ağırlıklı puana göre
        let scoreClass = 'score-low';
        if (stock.score === 100)     scoreClass = 'score-5';  // Mükemmel: tüm koşullar
        else if (stock.score >= 70)  scoreClass = 'score-4';  // Güçlü: kritik koşullar sağlandı
        else if (stock.score >= 45)  scoreClass = 'score-3';  // Orta: bazı koşullar sağlandı

        // Tüm koşullar sağlanıyorsa satır vurgusu
        const rowClass = stock.score === 100 ? 'all-met' : '';

        return `
            <tr class="${rowClass}" onclick="openModal('${stock.symbol}')">
                <td>
                    <div class="symbol-code">${stock.symbol}</div>
                    <div class="symbol-name">${stock.name}</div>
                </td>
                <td>
                    <span class="price">${formatPrice(stock.currentPrice)}</span>
                </td>
                <td>
                    <span class="${changeClass}">
                        ${changeSign}${stock.changePercent.toFixed(2)}%
                    </span>
                </td>

                <!-- Fibonacci Golden Pocket -->
                <td class="col-condition">
                    ${condIcon(stock.isInGoldenPocket)}
                </td>
                <!-- EMA20 > EMA50 -->
                <td class="col-condition">
                    ${condIcon(stock.emaCondition)}
                </td>
                <!-- MACD Crossover -->
                <td class="col-condition">
                    ${condIcon(stock.macdCrossover)}
                </td>
                <!-- RSI 50-70 -->
                <td class="col-condition">
                    ${condIcon(stock.rsiCondition)}
                </td>
                <!-- Hacim -->
                <td class="col-condition">
                    ${condIcon(stock.volumeCondition)}
                </td>

                <!-- Detay: RSI değeri -->
                <td>
                    <span class="rsi-value ${rsiClass}">${stock.rsi.toFixed(1)}</span>
                </td>

                <!-- Detay: Fibonacci 61.8 -->
                <td>
                    <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">
                        ${formatPrice(stock.fib618)}
                    </span>
                </td>

                <!-- Detay: Hacim değeri (bugün / ortalama) -->
                <td class="col-volume">
                    <span class="volume-value">${formatVolume(stock.volume)}</span>
                    <span style="color:var(--text-muted);font-size:10px"> / ${formatVolume(stock.averageVolume)}</span>
                </td>

                <!-- Detay: EMA200 (bilgi amaçlı, puanlamaya dahil değil) -->
                <td class="col-ema200">
                    <span class="ema200-value">${stock.ema200 ? formatPrice(stock.ema200) : '—'}</span>
                </td>

                <!-- Detay: ADX (bilgi amaçlı, puanlamaya dahil değil) -->
                <td class="col-adx">
                    <span class="adx-value ${stock.adx >= 25 ? 'adx-strong' : 'adx-weak'}">
                        ${stock.adx ? stock.adx.toFixed(1) : '—'}
                    </span>
                </td>

                <!-- Skor -->
                <td>
                    <span class="score-badge ${scoreClass}">
                        ${stock.score}
                    </span>
                </td>
            </tr>`;
    }).join('');
}

// ===== YARDIMCI FONKSİYONLAR =====

// Koşul ikonunu döndürür
function condIcon(condition) {
    return condition
        ? '<span class="cond-true">✓</span>'
        : '<span class="cond-false">✗</span>';
}

// Fiyatı Türk formatında gösterir
function formatPrice(price) {
    if (!price) return '—';
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

// Hacmi kısaltarak gösterir (örn: 1.2M, 450K)
function formatVolume(vol) {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toString();
}

// ===== MODAL: DETAY PANELİ =====
// (Grafik modülüne taşındı — aşağıya bak)

// ESC tuşu ile modal'ı kapat
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

// ===== GRAFİK MODÜLÜ =====
// Lightweight Charts (TradingView açık kaynak) kullanıyoruz
// Mum grafiği + EMA20 + EMA50 çizgileri + hacim barları + Fibonacci seviyeleri

let chartInstance     = null;  // Lightweight Charts instance
let candleSeries      = null;  // Mum serisi
let volumeSeries      = null;  // Hacim serisi
let ema20Series       = null;  // EMA20 çizgisi
let ema50Series       = null;  // EMA50 çizgisi
let currentSymbol     = null;  // Açık modal'daki hisse sembolü
let currentChartInterval = '1d'; // Aktif grafik interval'ı

// Hisseye tıklanınca modal'ı aç ve grafiği yükle
async function openModal(symbol) {
    // Normal modda allData, confluence modunda confluenceData.weekly'den ara
    let stock = allData.find(s => s.symbol === symbol);
    if (!stock && confluenceData) {
        const conf = confluenceData.find(c => c.symbol === symbol);
        stock = conf?.weekly ?? null;  // grafiği haftalık veriye göre aç
    }
    if (!stock) return;

    currentSymbol = symbol;

    // Başlık bilgilerini doldur
    document.getElementById('modalSymbol').textContent = stock.symbol;
    document.getElementById('modalName').textContent   = stock.name;
    document.getElementById('modalPrice').textContent  = `₺${formatPrice(stock.currentPrice)}`;

    const changeEl   = document.getElementById('modalChange');
    const changeSign = stock.changePercent >= 0 ? '+' : '';
    changeEl.textContent = `${changeSign}${stock.changePercent.toFixed(2)}%`;
    changeEl.style.color = stock.changePercent >= 0 ? 'var(--green)' : 'var(--red)';

    // İndikatör detaylarını doldur
    document.getElementById('modalContent').innerHTML = buildModalDetails(stock);

    // Modal'ı göster
    document.getElementById('modalOverlay').classList.add('open');

    // Grafik interval'ı tarama interval'ına göre ayarla
    // (Günlük tarama → grafik de günlük başlar)
    const defaultInterval = selectedInterval === 'weekly'  ? '1wk'
                          : selectedInterval === 'monthly' ? '1mo'
                          : '1d';

    // Interval butonunu aktif yap
    setActiveChartBtn(defaultInterval);

    // Grafiği yükle
    await loadChart(symbol, defaultInterval);
}

// Grafik interval butonunu aktif olarak işaretle
function setActiveChartBtn(interval) {
    document.querySelectorAll('.chart-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cinterval === interval);
    });
    currentChartInterval = interval;
}

// Grafiği yükle veya yenile
async function loadChart(symbol, interval) {
    setActiveChartBtn(interval);

    const loading   = document.getElementById('chartLoading');
    const container = document.getElementById('chartContainer');

    // Yükleme göstergesi
    loading.classList.remove('hidden');

    // Önceki chart instance'ı temizle (bellek sızıntısı önlemi)
    if (chartInstance) {
        chartInstance.remove();
        chartInstance = null;
    }

    try {
        // Backend'den OHLCV + EMA + Fibonacci verisi al
        const response = await fetch(`/api/scanner/chart/${symbol}?interval=${interval}`);
        if (!response.ok) throw new Error('Grafik verisi alınamadı');

        const data = await response.json();

        // Lightweight Charts'ı başlat
        chartInstance = LightweightCharts.createChart(container, {
            width:  container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { color: 'transparent' },
                textColor: '#7a8099',
            },
            grid: {
                vertLines: { color: '#1e2230' },
                horzLines: { color: '#1e2230' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: '#3d4257', labelBackgroundColor: '#151820' },
                horzLine: { color: '#3d4257', labelBackgroundColor: '#151820' },
            },
            rightPriceScale: {
                borderColor: '#1e2230',
                textColor:   '#7a8099',
            },
            timeScale: {
                borderColor:     '#1e2230',
                textColor:       '#7a8099',
                timeVisible:     interval === '1h',  // Saatlik'te saat göster
                secondsVisible:  false,
            },
        });

        // --- MUM SERİSİ ---
        candleSeries = chartInstance.addCandlestickSeries({
            upColor:        '#4fffb0',   // Yükseliş: yeşil
            downColor:      '#ff4d6d',   // Düşüş: kırmızı
            borderUpColor:  '#4fffb0',
            borderDownColor:'#ff4d6d',
            wickUpColor:    '#4fffb0',
            wickDownColor:  '#ff4d6d',
        });
        candleSeries.setData(data.candles);

        // --- HACİM SERİSİ (alt panel) ---
        volumeSeries = chartInstance.addHistogramSeries({
            priceFormat:    { type: 'volume' },
            priceScaleId:   'volume',  // Ayrı fiyat ekseni
            scaleMargins:   { top: 0.8, bottom: 0 },  // Grafiğin alt %20'si
        });
        volumeSeries.setData(data.volumes);

        // --- EMA20 ÇİZGİSİ ---
        ema20Series = chartInstance.addLineSeries({
            color:       '#4fffb0',  // Yeşil
            lineWidth:   1.5,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'EMA20',
        });
        ema20Series.setData(data.ema20);

        // --- EMA50 ÇİZGİSİ ---
        ema50Series = chartInstance.addLineSeries({
            color:       '#5b8dee',  // Mavi
            lineWidth:   1.5,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'EMA50',
        });
        ema50Series.setData(data.ema50);

        // --- FİBONACCI SEVİYELERİ (yatay çizgiler) ---
        const fib   = data.fibonacci;
        const fibs  = [
            { price: fib.swingHigh,          color: 'rgba(255,77,109,0.6)',   title: 'Swing High' },
            { price: fib.fib382,             color: 'rgba(255,209,102,0.4)',  title: 'Fib 38.2%'  },
            { price: fib.fib50,              color: 'rgba(255,209,102,0.5)',  title: 'Fib 50%'    },
            { price: fib.goldenPocketTop,    color: 'rgba(255,209,102,0.8)',  title: 'GP 61.8%'   },
            { price: fib.goldenPocketBottom, color: 'rgba(255,209,102,0.8)',  title: 'GP 65%'     },
            { price: fib.swingLow,           color: 'rgba(79,255,176,0.6)',   title: 'Swing Low'  },
        ];

        // Her Fibonacci seviyesi için yatay çizgi ekle
        fibs.forEach(f => {
            candleSeries.createPriceLine({
                price:         f.price,
                color:         f.color,
                lineWidth:     1,
                lineStyle:     LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title:         f.title,
            });
        });

        // Tüm veriyi ekrana sığdır
        chartInstance.timeScale().fitContent();

        // Pencere boyutu değişirse grafiği yeniden boyutlandır
        const resizeObserver = new ResizeObserver(() => {
            if (chartInstance) {
                chartInstance.applyOptions({
                    width:  container.clientWidth,
                    height: container.clientHeight,
                });
            }
        });
        resizeObserver.observe(container);

    } catch (err) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;
                        height:100%;color:var(--text-muted);font-size:13px">
                Grafik yüklenemedi: ${err.message}
            </div>`;
        console.error('Grafik hatası:', err);
    } finally {
        loading.classList.add('hidden');
    }
}

// Modal kapatılınca chart'ı da temizle
function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    if (chartInstance) {
        chartInstance.remove();
        chartInstance = null;
    }
}

// Modal indikatör detay bölümünü oluşturur
function buildModalDetails(stock) {
    const changeSign  = stock.changePercent >= 0 ? '+' : '';
    const changeColor = stock.changePercent >= 0 ? 'var(--green)' : 'var(--red)';

    return `
        <div class="modal-grid">
            <div class="modal-item ${stock.emaCondition   ? 'met' : ''}">
                <div class="modal-item-label">EMA 20</div>
                <div class="modal-item-value">₺${formatPrice(stock.ema20)}</div>
            </div>
            <div class="modal-item">
                <div class="modal-item-label">EMA 50</div>
                <div class="modal-item-value">₺${formatPrice(stock.ema50)}</div>
            </div>
            <div class="modal-item">
                <div class="modal-item-label">EMA 200 <span style="font-size:9px;color:var(--text-muted)">(bilgi)</span></div>
                <div class="modal-item-value">${stock.ema200 ? '₺' + formatPrice(stock.ema200) : '—'}</div>
            </div>
            <div class="modal-item">
                <div class="modal-item-label">ADX (14) <span style="font-size:9px;color:var(--text-muted)">(bilgi)</span></div>
                <div class="modal-item-value" style="color:${stock.adx >= 25 ? 'var(--green)' : 'var(--text-secondary)'}">
                    ${stock.adx ? stock.adx.toFixed(1) : '—'}
                </div>
            </div>
            <div class="modal-item ${stock.macdCrossover  ? 'met' : ''}">
                <div class="modal-item-label">MACD</div>
                <div class="modal-item-value">${stock.macdLine.toFixed(3)}</div>
            </div>
            <div class="modal-item ${stock.rsiCondition   ? 'met' : ''}">
                <div class="modal-item-label">RSI (14)</div>
                <div class="modal-item-value">${stock.rsi.toFixed(2)}</div>
            </div>
            <div class="modal-item ${stock.volumeCondition ? 'met' : ''}">
                <div class="modal-item-label">Hacim / Ort.</div>
                <div class="modal-item-value">${formatVolume(stock.volume)} / ${formatVolume(stock.averageVolume)}</div>
            </div>
            <div class="modal-item ${stock.isInGoldenPocket ? 'met' : ''}">
                <div class="modal-item-label">Golden Pocket</div>
                <div class="modal-item-value" style="font-size:11px">
                    ₺${formatPrice(stock.goldenPocketBottom)}–${formatPrice(stock.goldenPocketTop)}
                </div>
            </div>
            <div class="modal-item">
                <div class="modal-item-label">Swing High</div>
                <div class="modal-item-value">₺${formatPrice(stock.swingHigh)}</div>
            </div>
            <div class="modal-item">
                <div class="modal-item-label">Swing Low</div>
                <div class="modal-item-value">₺${formatPrice(stock.swingLow)}</div>
            </div>
        </div>

        <div class="modal-conditions">
            ${modalCond(stock.isInGoldenPocket, 'Fibonacci Golden Pocket',  `₺${formatPrice(stock.goldenPocketBottom)} – ₺${formatPrice(stock.goldenPocketTop)}`, 35)}
            ${modalCond(stock.emaCondition,     'EMA20 > EMA50',            `EMA20: ₺${formatPrice(stock.ema20)} | EMA50: ₺${formatPrice(stock.ema50)}`, 20)}
            ${modalCond(stock.macdCrossover,    'MACD Bullish Crossover',   `MACD: ${stock.macdLine.toFixed(3)} / Signal: ${stock.macdSignal.toFixed(3)}`, 20)}
            ${modalCond(stock.volumeCondition,  'Hacim Ortalamanın Üzeri',  `${formatVolume(stock.volume)} vs ort. ${formatVolume(stock.averageVolume)}`, 15)}
            ${modalCond(stock.rsiCondition,     'RSI 50–70',                `RSI: ${stock.rsi.toFixed(2)}`, 10)}
        </div>`;
}

// Koşul satırı — puan ağırlığını da gösteriyor
function modalCond(met, label, detail, weight) {
    return `
        <div class="modal-cond ${met ? 'met' : 'fail'}">
            <span style="color:${met ? 'var(--green)' : 'var(--red)'}; font-size:14px">
                ${met ? '✓' : '✗'}
            </span>
            <div style="flex:1">
                <div style="font-weight:600;color:var(--text-primary)">${label}</div>
                <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">${detail}</div>
            </div>
            <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;
                        color:${met ? 'var(--green)' : 'var(--text-muted)'}">
                ${met ? '+' : ''}${met ? weight : 0}
            </div>
        </div>`;
}

// ===== AYARLAR PANELİ =====

function toggleSettings() {
    document.getElementById('settingsOverlay').classList.add('open');
    loadSettings();
}

function closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('open');
}

// Ayarları localStorage'dan yükle
function loadSettings() {
    const source = localStorage.getItem('apiSource') || 'yahoo';
    const key    = localStorage.getItem('twelveApiKey') || '';

    document.querySelector(`input[name="apiSource"][value="${source}"]`).checked = true;
    document.getElementById('twelveApiKey').value = key;

    toggleTwelveKeyGroup();
    updateApiBadge();
}

// Ayarları localStorage'a kaydet
function saveSettings() {
    const source = document.querySelector('input[name="apiSource"]:checked')?.value || 'yahoo';
    const key    = document.getElementById('twelveApiKey').value.trim();

    localStorage.setItem('apiSource', source);
    if (key) localStorage.setItem('twelveApiKey', key);

    toggleTwelveKeyGroup();
    updateApiBadge();
}

// API seçimine göre Twelve Data key alanını göster/gizle
function toggleTwelveKeyGroup() {
    const source = document.querySelector('input[name="apiSource"]:checked')?.value;
    const group  = document.getElementById('twelveKeyGroup');
    if (group) group.style.display = source === 'twelvedata' ? 'flex' : 'none';
}

function updateApiBadge() {
    const source = localStorage.getItem('apiSource') || 'yahoo';
    const badge  = document.getElementById('currentApiBadge');
    if (badge) {
        badge.textContent = source === 'twelvedata'
            ? '⚡ Twelve Data aktif'
            : '☁️ Yahoo Finance aktif';
    }
}

// API seçim radio'larına listener ekle
document.querySelectorAll('input[name="apiSource"]').forEach(radio => {
    radio.addEventListener('change', saveSettings);
});

// Sayfa açılışında ayarları yükle
loadSettings();

// startScan fonksiyonunu API ayarlarıyla override et
const _originalStartScan = startScan;
// Not: startScan'ı aşağıda yeniden tanımlıyoruz


// ===== API FALLBACK UYARISI =====

function showApiWarning(message) {
    const el = document.getElementById('apiWarning');
    document.getElementById('apiWarningText').textContent = message;
    el.style.display = 'block';
    // 10 saniye sonra otomatik kapat
    setTimeout(() => { el.style.display = 'none'; }, 10000);
}


// ===== EXCEL EXPORT =====

function exportExcel() {
    // Confluence modunda confluenceData, normal modda filteredData kullan
    const isConfluence = confluenceData && confluenceData.length > 0 && selectedInterval === 'confluence';

    if (isConfluence) {
        exportConfluenceExcel();
        return;
    }

    if (!filteredData || filteredData.length === 0) {
        alert('Önce tarama yapın.');
        return;
    }

    const rows = filteredData.filter(s => !s.errorMessage).map(s => ({
        'Sembol':          s.symbol,
        'Şirket':          s.name,
        'Fiyat (₺)':       s.currentPrice,
        'Değişim (%)':     s.changePercent,
        'Skor':            s.score,
        'Fib Golden Pocket': s.isInGoldenPocket ? 'Evet' : 'Hayır',
        'EMA20>50':        s.emaCondition   ? 'Evet' : 'Hayır',
        'MACD Crossover':  s.macdCrossover  ? 'Evet' : 'Hayır',
        'RSI 50-70':       s.rsiCondition   ? 'Evet' : 'Hayır',
        'Hacim Filtresi':  s.volumeCondition ? 'Evet' : 'Hayır',
        'RSI Değeri':      s.rsi,
        'EMA20':           s.ema20,
        'EMA50':           s.ema50,
        'EMA200':          s.ema200 || '',
        'ADX':             s.adx || '',
        'Fib 61.8':        s.fib618,
        'Golden Pocket Üst': s.goldenPocketTop,
        'Golden Pocket Alt': s.goldenPocketBottom,
        'Swing High':      s.swingHigh,
        'Swing Low':       s.swingLow,
        'Hacim':           s.volume,
        'Ort. Hacim (20g)': s.averageVolume,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BIST Tarama');

    // Kolon genişliklerini ayarla
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

function exportPDF() {
    const isConfluence = confluenceData && confluenceData.length > 0 && selectedInterval === 'confluence';
    if (isConfluence) {
        exportConfluencePDF();
        return;
    }

    if (!filteredData || filteredData.length === 0) {
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
    doc.text(`Toplam: ${filteredData.filter(s => !s.errorMessage).length} hisse`, 14, 26);

    const rows = filteredData
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
            fontSize:  7,
            cellPadding: 2,
            textColor: [232, 234, 240],
            fillColor: [17, 19, 24],
        },
        headStyles: {
            fillColor:  [21, 24, 32],
            textColor:  [79, 255, 176],
            fontStyle:  'bold',
            fontSize:   7,
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

// ===== CONFLUENCE MODÜ =====

let confluenceData = null;

function updateConfluenceSummary(result) {
    // Geçerli sonuçlar: her iki timeframe verisi olan ve hatasız olanlar
    const validConf = result.data.filter(d => !d.weekly?.errorMessage);
    document.getElementById('totalCount').textContent  = validConf.length;
    document.getElementById('allMetCount').textContent =
        validConf.filter(d => d.confluenceScore === 100).length;
    document.getElementById('fourPlusCount').textContent =
        validConf.filter(d => d.confluenceScore >= 70).length;
    document.getElementById('lastScan').textContent = result.scannedAt;

    const badge = document.getElementById('cacheBadge');
    if (badge) {
        badge.style.display = 'block';
        badge.style.background = result.fromCache ? 'rgba(255,209,102,0.15)' : 'rgba(79,255,176,0.1)';
        badge.style.color  = result.fromCache ? '#ffd166' : '#4fffb0';
        badge.style.border = result.fromCache ? '1px solid rgba(255,209,102,0.3)' : '1px solid rgba(79,255,176,0.2)';
        badge.textContent  = result.fromCache
            ? `⚡ Cache · ${result.cacheExpiresAt}'e kadar`
            : `✓ Canlı · ${result.cacheExpiresAt}'e kadar geçerli`;
    }

    // Özet kart etiketlerini confluence için güncelle
    document.querySelector('#summaryRow .summary-card:nth-child(2) .summary-label').textContent = '100 Puan ✓';
    document.querySelector('#summaryRow .summary-card:nth-child(3) .summary-label').textContent = '70+ Puan';

    document.getElementById('summaryRow').style.display = 'grid';
    // Confluence'da da filtre satırını göster
    document.getElementById('filterRow').style.display  = 'flex';
    document.getElementById('tableWrapper').style.display = 'block';
}

function applyConfluenceFilter() {
    if (!confluenceData) return;
    const filterVal = document.getElementById('filterSelect').value;
    const searchVal = document.getElementById('searchInput').value.toUpperCase().trim();

    const filtered = confluenceData.filter(c => {
        // Hata olanları ve günlük verisi olmayanları atla
        // Sadece haftalık veri hatası varsa eleriz — günlük hata olsa bile gösteririz
        if (c.weekly?.errorMessage) return false;

        if (filterVal === '5'  && c.confluenceScore < 100) return false;
        if (filterVal === '4'  && c.confluenceScore < 70)  return false;
        if (filterVal === '3'  && c.confluenceScore < 45)  return false;

        if (searchVal && !c.symbol.includes(searchVal) &&
            !c.name.toUpperCase().includes(searchVal)) return false;

        return true;
    });

    document.getElementById('resultCount').textContent = `${filtered.length} hisse gösteriliyor`;
    renderConfluenceTable(filtered);
}

function renderConfluenceTable(data) {
    const tbody = document.getElementById('tableBody');

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">Sonuç bulunamadı</td></tr>`;
        return;
    }

    // Confluence tablosu için thead'i güncelle
    const thead = document.querySelector('.scan-table thead tr');
    thead.innerHTML = `
        <th onclick="sortConfluenceBy('symbol')">Hisse <span class="sort-icon">⇅</span></th>
        <th onclick="sortConfluenceBy('currentPrice')">Fiyat <span class="sort-icon">⇅</span></th>
        <th onclick="sortConfluenceBy('changePercent')">Değişim <span class="sort-icon">⇅</span></th>
        <th class="has-tooltip" data-tooltip="Haftalık grafikte teknik skor (0-100). Ağırlık: %60">
            <div class="th-label">Haftalık</div><div class="th-sub">Skor</div>
        </th>
        <th class="has-tooltip" data-tooltip="Günlük grafikte teknik skor (0-100). Ağırlık: %40">
            <div class="th-label">Günlük</div><div class="th-sub">Skor</div>
        </th>
        <th class="has-tooltip" data-tooltip="Her iki timeframe'de aynı koşullar sağlandığında kazanılan bonus puan (+5 EMA, +5 MACD, +8 Golden Pocket, +3 RSI, +4 Hacim)">
            <div class="th-label">Bonus</div><div class="th-sub">Alignment</div>
        </th>
        <th onclick="sortConfluenceBy('confluenceScore')" class="has-tooltip" data-tooltip="Birleşik skor: Haftalık %60 + Günlük %40 + Alignment bonusu. Ne kadar yüksekse iki timeframe o kadar uyumlu.">
            Confluence <span class="sort-icon">⇅</span>
        </th>
        <th class="has-tooltip" data-tooltip="Haftalık RSI değeri">H.RSI</th>
        <th class="has-tooltip" data-tooltip="Günlük RSI değeri">G.RSI</th>
        <th class="has-tooltip" data-tooltip="Her iki timeframe'de EMA dizilimi düzgün ve RSI 50-75 arasında mı?">Tam Uyum</th>
    `;

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
            <tr class="${rowClass}" onclick="openModal('${c.symbol}')">
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

function sortConfluenceBy(key) {
    if (!confluenceData) return;
    confluenceData.sort((a, b) => {
        const va = key === 'symbol' ? a.symbol : (a[key] ?? 0);
        const vb = key === 'symbol' ? b.symbol : (b[key] ?? 0);
        return typeof va === 'string' ? va.localeCompare(vb) : vb - va;
    });
    applyConfluenceFilter();
}

// ===== CONFLUENCE EXPORT =====

function exportConfluenceExcel() {
    if (!confluenceData || confluenceData.length === 0) {
        alert('Önce confluence taraması yapın.');
        return;
    }

    const rows = confluenceData
        .filter(c => !c.weekly?.errorMessage)
        .map(c => ({
        'Sembol':              c.symbol,
        'Şirket':              c.name,
        'Fiyat (₺)':           c.currentPrice,
        'Değişim (%)':         c.changePercent,
        'Confluence Skor':     c.confluenceScore,
        'Alignment Bonus':     c.alignmentBonus,
        'Tam Uyum':            c.fullAlignment ? 'Evet' : 'Hayır',
        // Haftalık
        'H. Skor':             c.weekly?.score ?? '',
        'H. RSI':              c.weekly?.rsi ?? '',
        'H. EMA Koşulu':       c.weekly?.emaCondition ? 'Evet' : 'Hayır',
        'H. MACD Crossover':   c.weekly?.macdCrossover ? 'Evet' : 'Hayır',
        'H. Golden Pocket':    c.weekly?.isInGoldenPocket ? 'Evet' : 'Hayır',
        'H. Hacim Filtresi':   c.weekly?.volumeCondition ? 'Evet' : 'Hayır',
        'H. EMA20':            c.weekly?.ema20 ?? '',
        'H. EMA50':            c.weekly?.ema50 ?? '',
        'H. EMA200':           c.weekly?.ema200 ?? '',
        'H. ADX':              c.weekly?.adx ?? '',
        // Günlük
        'G. Skor':             c.daily?.score ?? '',
        'G. RSI':              c.daily?.rsi ?? '',
        'G. EMA Koşulu':       c.daily?.emaCondition ? 'Evet' : 'Hayır',
        'G. MACD Crossover':   c.daily?.macdCrossover ? 'Evet' : 'Hayır',
        'G. Golden Pocket':    c.daily?.isInGoldenPocket ? 'Evet' : 'Hayır',
        'G. Hacim Filtresi':   c.daily?.volumeCondition ? 'Evet' : 'Hayır',
        'G. EMA20':            c.daily?.ema20 ?? '',
        'G. EMA50':            c.daily?.ema50 ?? '',
        'G. EMA200':           c.daily?.ema200 ?? '',
        'G. ADX':              c.daily?.adx ?? '',
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
    if (!confluenceData || confluenceData.length === 0) {
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
    doc.text(`Toplam: ${confluenceData.length} hisse`, 14, 26);

    const rows = confluenceData
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
