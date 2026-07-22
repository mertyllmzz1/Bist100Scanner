// settings.js — API kaynak seçimi ayar paneli
// Ayarlar localStorage'da saklanır; key sunucuya yalnızca tarama
// isteğinin gövdesinde gönderilir.

// Tarama isteği için aktif ayarları döndürür
export function getApiSettings() {
    return {
        apiSource:    localStorage.getItem('apiSource') || 'yahoo',
        twelveApiKey: localStorage.getItem('twelveApiKey') || ''
    };
}

export function openSettings() {
    document.getElementById('settingsOverlay').classList.add('open');
    loadSettings();
}

export function closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('open');
}

// Ayarları localStorage'dan yükleyip formu doldurur
export function loadSettings() {
    const { apiSource, twelveApiKey } = getApiSettings();

    document.querySelector(`input[name="apiSource"][value="${apiSource}"]`).checked = true;
    document.getElementById('twelveApiKey').value = twelveApiKey;

    toggleTwelveKeyGroup();
    updateApiBadge();
}

// Formdaki değerleri localStorage'a kaydeder
export function saveSettings() {
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
    const { apiSource } = getApiSettings();
    const badge = document.getElementById('currentApiBadge');
    if (badge) {
        badge.textContent = apiSource === 'twelvedata'
            ? '⚡ Twelve Data aktif'
            : '☁️ Yahoo Finance aktif';
    }
}
