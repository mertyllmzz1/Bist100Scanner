// main.js — Uygulamanın giriş noktası
// Tek görevi: modülleri birbirine bağlamak ve DOM event'lerini kurmak.
// index.html'de artık hiç inline onclick yok — tüm bağlantılar burada.
//
// Tablo satırları ve başlıkları için EVENT DELEGATION kullanılır:
// innerHTML her yenilendiğinde listener'lar kaybolmasın diye olaylar
// üst elemanlarda (tbody/thead) dinlenir, hedef data-* attribute'tan okunur.

import { state } from './state.js';
import { runScan } from './api.js';
import {
    captureDefaultThead,
    updateSummary, updateConfluenceSummary,
    applyActiveFilter, sortActiveBy
} from './table.js';
import { openModal, closeModal, loadChart } from './chart.js';
import { exportExcel, exportPDF } from './export.js';
import { openSettings, closeSettings, loadSettings, saveSettings } from './settings.js';
import { getApiSettings } from './settings.js';

// ===== TARAMA AKIŞI =====

async function startScan() {
    const btn       = document.getElementById('scanBtn');
    const statusBar = document.getElementById('statusBar');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Taranıyor...';
    statusBar.style.display = 'block';

    // Confluence modunda iki tarama aynı anda yapılır — daha uzun sürer
    document.getElementById('statusText').textContent = state.selectedInterval === 'confluence'
        ? 'Haftalık + Günlük çift tarama yapılıyor...'
        : 'BİST hisseleri taranıyor...';
    document.querySelector('.status-note').textContent = state.selectedInterval === 'confluence'
        ? 'Bu işlem ~3-4 dakika sürebilir (iki tarama paralel)'
        : 'Bu işlem ~1-2 dakika sürebilir';

    document.getElementById('tableWrapper').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';

    try {
        const { apiSource, twelveApiKey } = getApiSettings();
        const result = await runScan(state.selectedInterval, apiSource, twelveApiKey);

        // Veriyi sakla ve tabloyu güncelle
        if (state.selectedInterval === 'confluence') {
            state.viewMode       = 'confluence';
            state.confluenceData = result.data;
            state.allData        = [];
            updateConfluenceSummary(result);
        } else {
            state.viewMode       = 'normal';
            state.confluenceData = null;
            state.allData        = result.data;
            updateSummary(result);
        }
        applyActiveFilter();

        // Twelve Data → Yahoo fallback olduysa uyar
        if (result.warning) showApiWarning(result.warning);

        // Export, filtre, özet ve tabloyu göster
        document.getElementById('exportGroup').style.display  = 'flex';
        document.getElementById('filterRow').style.display    = 'flex';
        document.getElementById('summaryRow').style.display   = 'grid';
        document.getElementById('tableWrapper').style.display = 'block';

    } catch (error) {
        alert(`Tarama hatası: ${error.message}`);
        document.getElementById('emptyState').style.display = 'block';
        console.error('Tarama hatası:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">Tara</span>';
        statusBar.style.display = 'none';
    }
}

// ===== API FALLBACK UYARISI =====

function showApiWarning(message) {
    const el = document.getElementById('apiWarning');
    document.getElementById('apiWarningText').textContent = message;
    el.style.display = 'block';
    // 10 saniye sonra otomatik kapat
    setTimeout(() => { el.style.display = 'none'; }, 10000);
}

// ===== EVENT BAĞLAMA =====

function bindEvents() {
    // --- Zaman dilimi seçimi ---
    document.querySelectorAll('.interval-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedInterval = btn.dataset.interval;
        });
    });

    // --- Ana butonlar ---
    document.getElementById('scanBtn').addEventListener('click', startScan);
    document.getElementById('exportExcelBtn').addEventListener('click', exportExcel);
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);

    // --- Filtreler ---
    document.getElementById('filterSelect').addEventListener('change', applyActiveFilter);
    document.getElementById('searchInput').addEventListener('input', applyActiveFilter);

    // --- Tablo: sıralama (delegation, thead üzerinde) ---
    // Confluence modu thead'i yeniden yazsa bile listener kaybolmaz
    document.querySelector('.scan-table thead').addEventListener('click', e => {
        const th = e.target.closest('th[data-sort]');
        if (th) sortActiveBy(th.dataset.sort);
    });

    // --- Tablo: satıra tıkla → detay modal'ı (delegation, tbody üzerinde) ---
    document.getElementById('tableBody').addEventListener('click', e => {
        const row = e.target.closest('tr[data-symbol]');
        if (row) openModal(row.dataset.symbol);
    });

    // --- Modal ---
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    // Overlay'in boş alanına tıklanınca kapat (panelin içi hariç)
    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });

    // --- Grafik interval butonları ---
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.currentSymbol) loadChart(state.currentSymbol, btn.dataset.cinterval);
        });
    });

    // --- Ayarlar paneli ---
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
    document.getElementById('settingsOkBtn').addEventListener('click', closeSettings);
    document.getElementById('settingsOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeSettings();
    });

    // API kaynağı değişince ve key yazılırken otomatik kaydet
    document.querySelectorAll('input[name="apiSource"]').forEach(radio => {
        radio.addEventListener('change', saveSettings);
    });
    document.getElementById('twelveApiKey').addEventListener('input', saveSettings);

    // --- API uyarısını elle kapatma ---
    document.getElementById('apiWarningCloseBtn').addEventListener('click', () => {
        document.getElementById('apiWarning').style.display = 'none';
    });

    // --- ESC tuşu ile modal'ı kapat ---
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
}

// ===== BAŞLANGIÇ =====
// type="module" script'ler DOM parse edildikten sonra çalışır — DOM hazırdır.
captureDefaultThead();  // Confluence sonrası geri dönüş için orijinal başlıkları sakla
bindEvents();
loadSettings();
