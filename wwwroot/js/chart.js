// chart.js — Detay modal'ı ve grafik modülü
// Lightweight Charts v3.8.0 (CDN'den global olarak yüklü — pin'li, v4 API kırıcı)
// Mum grafiği + EMA20/EMA50 çizgileri + hacim barları + Fibonacci seviyeleri

import { state } from './state.js';
import { fetchChart } from './api.js';
import { formatPrice, formatVolume } from './utils.js';

let chartInstance = null;  // Lightweight Charts instance — bellek sızıntısına karşı takip

// Hisseye tıklanınca modal'ı aç ve grafiği yükle
export async function openModal(symbol) {
    // Normal modda allData, confluence modunda weekly sinyalinden bul
    let stock = state.allData.find(s => s.symbol === symbol);
    if (!stock && state.confluenceData) {
        const conf = state.confluenceData.find(c => c.symbol === symbol);
        stock = conf?.weekly ?? null;  // grafiği haftalık veriye göre aç
    }
    if (!stock) return;

    state.currentSymbol = symbol;

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

    // Grafik interval'ı tarama interval'ına göre başlasın
    const defaultInterval = state.selectedInterval === 'weekly'  ? '1wk'
                          : state.selectedInterval === 'monthly' ? '1mo'
                          : '1d';

    await loadChart(symbol, defaultInterval);
}

// Modal kapatılınca chart'ı da temizle (bellek sızıntısı önlemi)
export function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    if (chartInstance) {
        chartInstance.remove();
        chartInstance = null;
    }
}

// Grafik interval butonunu aktif olarak işaretle
function setActiveChartBtn(interval) {
    document.querySelectorAll('.chart-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cinterval === interval);
    });
    state.currentChartInterval = interval;
}

// Grafiği yükle veya yenile
export async function loadChart(symbol, interval) {
    setActiveChartBtn(interval);

    const loading   = document.getElementById('chartLoading');
    const container = document.getElementById('chartContainer');

    loading.classList.remove('hidden');

    // Önceki chart instance'ı temizle
    if (chartInstance) {
        chartInstance.remove();
        chartInstance = null;
    }

    try {
        // Backend'den OHLCV + EMA + Fibonacci verisi al
        const data = await fetchChart(symbol, interval);

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
                borderColor:    '#1e2230',
                textColor:      '#7a8099',
                timeVisible:    interval === '1h',  // Saatlik'te saat göster
                secondsVisible: false,
            },
        });

        // --- MUM SERİSİ ---
        const candleSeries = chartInstance.addCandlestickSeries({
            upColor:         '#4fffb0',
            downColor:       '#ff4d6d',
            borderUpColor:   '#4fffb0',
            borderDownColor: '#ff4d6d',
            wickUpColor:     '#4fffb0',
            wickDownColor:   '#ff4d6d',
        });
        candleSeries.setData(data.candles);

        // --- HACİM SERİSİ (alt panel) ---
        const volumeSeries = chartInstance.addHistogramSeries({
            priceFormat:  { type: 'volume' },
            priceScaleId: 'volume',
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeSeries.setData(data.volumes);

        // --- EMA20 ÇİZGİSİ ---
        const ema20Series = chartInstance.addLineSeries({
            color: '#4fffb0',
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'EMA20',
        });
        ema20Series.setData(data.ema20);

        // --- EMA50 ÇİZGİSİ ---
        const ema50Series = chartInstance.addLineSeries({
            color: '#5b8dee',
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'EMA50',
        });
        ema50Series.setData(data.ema50);

        // --- FİBONACCI SEVİYELERİ (yatay çizgiler) ---
        const fib  = data.fibonacci;
        const fibs = [
            { price: fib.swingHigh,          color: 'rgba(255,77,109,0.6)',  title: 'Swing High' },
            { price: fib.fib382,             color: 'rgba(255,209,102,0.4)', title: 'Fib 38.2%'  },
            { price: fib.fib50,              color: 'rgba(255,209,102,0.5)', title: 'Fib 50%'    },
            { price: fib.goldenPocketTop,    color: 'rgba(255,209,102,0.8)', title: 'GP 61.8%'   },
            { price: fib.goldenPocketBottom, color: 'rgba(255,209,102,0.8)', title: 'GP 65%'     },
            { price: fib.swingLow,           color: 'rgba(79,255,176,0.6)',  title: 'Swing Low'  },
        ];

        fibs.forEach(f => {
            candleSeries.createPriceLine({
                price:            f.price,
                color:            f.color,
                lineWidth:        1,
                lineStyle:        LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title:            f.title,
            });
        });

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

// Modal indikatör detay bölümünü oluşturur
function buildModalDetails(stock) {
    return `
        <div class="modal-grid">
            <div class="modal-item ${stock.emaCondition ? 'met' : ''}">
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
            <div class="modal-item ${stock.macdCrossover ? 'met' : ''}">
                <div class="modal-item-label">MACD</div>
                <div class="modal-item-value">${stock.macdLine.toFixed(3)}</div>
            </div>
            <div class="modal-item ${stock.rsiCondition ? 'met' : ''}">
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
            ${modalCond(stock.isInGoldenPocket, 'Fibonacci Golden Pocket', `₺${formatPrice(stock.goldenPocketBottom)} – ₺${formatPrice(stock.goldenPocketTop)}`, 35)}
            ${modalCond(stock.emaCondition,     'EMA20 > EMA50',           `EMA20: ₺${formatPrice(stock.ema20)} | EMA50: ₺${formatPrice(stock.ema50)}`, 20)}
            ${modalCond(stock.macdCrossover,    'MACD Bullish Crossover',  `MACD: ${stock.macdLine.toFixed(3)} / Signal: ${stock.macdSignal.toFixed(3)}`, 20)}
            ${modalCond(stock.volumeCondition,  'Hacim Ortalamanın Üzeri', `${formatVolume(stock.volume)} vs ort. ${formatVolume(stock.averageVolume)}`, 15)}
            ${modalCond(stock.rsiCondition,     'RSI 50–70',               `RSI: ${stock.rsi.toFixed(2)}`, 10)}
        </div>`;
}

// Koşul satırı — puan ağırlığını da gösterir
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
