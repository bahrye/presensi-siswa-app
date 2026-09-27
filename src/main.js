/**
 * =========================================================================
 * APLIKASI PRESENSI SISWA - GOOGLE SHEETS CLOUD INTEGRATION
 * =========================================================================
 */

import './style.css';
import { storage } from './services/storage';
import { api } from './services/api';
import { feedback } from './services/sound';
import { icons } from './components/Icons';

// --- State Aplikasi ---
const state = {
  endpointUrl: '',
  currentGuru: null,
  guruList: [],
  kelasList: ['7A', '7B', '8A', '8B', '9A'],
  selectedKelas: '7A',
  selectedTanggal: new Date().toISOString().split('T')[0],
  siswaList: [],
  attendanceMap: {}, // { [id_siswa]: { status: 'Hadir' | 'Izin' | 'Sakit' | 'Alpa', keterangan: '' } }
  searchQuery: '',
  activeTab: 'presensi', // 'presensi' | 'riwayat' | 'rekap' | 'settings'
  offlineQueue: [],
  isOnline: navigator.onLine,
  isLiveConnected: false,
  theme: 'light'
};

// --- Inisialisasi Aplikasi ---
async function initApp() {
  // 1. Muat Theme
  state.theme = await storage.getThemeMode();
  document.documentElement.setAttribute('data-theme', state.theme);

  // 2. Muat Konfigurasi & Sesi
  state.endpointUrl = await storage.getEndpointUrl();
  state.currentGuru = await storage.getCurrentGuru();
  state.offlineQueue = await storage.getOfflineQueue();

  // 3. Render Struktur Shell UI
  renderAppShell();

  // 4. Muat Data Inisial (Guru & Kelas)
  await loadInitData();

  // 5. Muat Data Siswa untuk Kelas Terpilih
  await loadSiswaForCurrentKelas();

  // 6. Listeners Network Online/Offline
  window.addEventListener('online', () => {
    state.isOnline = true;
    updateNetworkStatusUI();
    showToast('Koneksi internet kembali online!', 'success');
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    updateNetworkStatusUI();
    showToast('Mode offline aktif. Presensi akan disimpan di memori HP.', 'warning');
  });
}

// --- Render Struktur Shell Aplikasi ---
function renderAppShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top App Bar -->
    <header class="app-header">
      <div class="header-top">
        <div class="app-branding">
          <div class="app-logo-badge">PS</div>
          <div class="app-title-group">
            <h1>Presensi Siswa</h1>
            <div class="app-subtitle" id="appSubtitle">Google Sheets Cloud Sync</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="status-badge ${state.endpointUrl ? 'online' : 'offline'}" id="connectionBadge" title="Status Koneksi">
            ${state.endpointUrl ? icons.wifi : icons.wifiOff}
            <span id="connectionBadgeText">${state.endpointUrl ? 'Sheets Aktif' : 'Mode Offline'}</span>
          </div>
          <button class="icon-btn" id="btnToggleTheme" title="Ganti Tema">
            ${state.theme === 'dark' ? icons.sun : icons.moon}
          </button>
        </div>
      </div>

      <!-- Teacher Info Strip -->
      <div class="teacher-strip">
        <div class="teacher-info">
          <div class="teacher-avatar" id="headerTeacherAvatar">
            ${getInitials(state.currentGuru?.nama_guru || 'Guru')}
          </div>
          <div>
            <div style="font-size:12px; font-weight:700;" id="headerTeacherName">${state.currentGuru?.nama_guru || 'Pilih Guru'}</div>
            <div style="font-size:10px; opacity:0.8;" id="headerTeacherRole">Wali Kelas: ${state.currentGuru?.wali_kelas || '-'}</div>
          </div>
        </div>
        <button class="btn-switch-guru" id="btnSwitchGuru">Ganti Guru</button>
      </div>
    </header>

    <!-- Offline Queue Banner (Muncul jika ada antrean tersimpan) -->
    <div class="offline-banner" id="offlineQueueBanner" style="${state.offlineQueue.length > 0 ? '' : 'display:none;'}">
      <div>
        <span id="offlineQueueCount">${state.offlineQueue.length}</span> presensi menunggu sinkronisasi
      </div>
      <button class="btn-sync-now" id="btnSyncOffline">Sinkron Sekarang</button>
    </div>

    <!-- Main Tab Content Area -->
    <main class="tab-content">
      <!-- 1. TAB PRESENSI -->
      <section class="tab-pane active" id="tabPresensi">
        <!-- Filter Card: Kelas & Tanggal -->
        <div class="filter-card">
          <div class="filter-grid">
            <div class="input-group">
              <label for="selectKelas">Pilih Kelas</label>
              <select class="select-control" id="selectKelas">
                ${state.kelasList.map(k => `<option value="${k}" ${k === state.selectedKelas ? 'selected' : ''}>Kelas ${k}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label for="inputTanggal">Tanggal Presensi</label>
              <input type="date" class="input-control" id="inputTanggal" value="${state.selectedTanggal}" />
            </div>
          </div>
        </div>

        <!-- Quick Actions Row -->
        <div class="quick-actions-bar">
          <button class="btn-quick-all" id="btnSetSemuaHadir" title="Set Semua Siswa Hadir">
            ${icons.check} Set Semua Hadir
          </button>
          <div class="search-container">
            <span class="search-icon">${icons.search}</span>
            <input type="text" class="search-input" id="inputSearchSiswa" placeholder="Cari nama / NISN..." />
          </div>
        </div>

        <!-- Student Attendance List Container -->
        <div class="student-list" id="studentListContainer">
          <!-- Rendered dynamically -->
        </div>
      </section>

      <!-- 2. TAB RIWAYAT -->
      <section class="tab-pane" id="tabRiwayat">
        <div class="filter-card">
          <div class="filter-grid">
            <div class="input-group">
              <label for="historySelectKelas">Filter Kelas</label>
              <select class="select-control" id="historySelectKelas">
                ${state.kelasList.map(k => `<option value="${k}" ${k === state.selectedKelas ? 'selected' : ''}>Kelas ${k}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label for="historyInputTanggal">Pilih Tanggal</label>
              <input type="date" class="input-control" id="historyInputTanggal" value="${state.selectedTanggal}" />
            </div>
          </div>
          <button class="btn-primary" id="btnLoadHistory" style="width:100%; margin-top:10px;">
            ${icons.refresh} Muat Riwayat
          </button>
        </div>

        <div id="historyResultContainer">
          <div class="empty-state">
            <div class="empty-state-icon">${icons.history}</div>
            <p>Pilih kelas & tanggal, lalu tekan <b>Muat Riwayat</b> untuk melihat data.</p>
          </div>
        </div>
      </section>

      <!-- 3. TAB REKAP -->
      <section class="tab-pane" id="tabRekap">
        <div class="filter-card">
          <div class="filter-grid">
            <div class="input-group">
              <label for="rekapSelectKelas">Pilih Kelas</label>
              <select class="select-control" id="rekapSelectKelas">
                ${state.kelasList.map(k => `<option value="${k}" ${k === state.selectedKelas ? 'selected' : ''}>Kelas ${k}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label for="rekapSelectBulan">Pilih Bulan</label>
              <input type="month" class="input-control" id="rekapSelectBulan" value="${state.selectedTanggal.substring(0, 7)}" />
            </div>
          </div>
          <button class="btn-primary" id="btnLoadRekap" style="width:100%; margin-top:10px;">
            ${icons.barChart} Tampilkan Rekap
          </button>
        </div>

        <div id="rekapResultContainer">
          <div class="empty-state">
            <div class="empty-state-icon">${icons.barChart}</div>
            <p>Pilih kelas dan bulan untuk melihat rekapitulasi kehadiran siswa.</p>
          </div>
        </div>
      </section>

      <!-- 4. TAB PENGATURAN -->
      <section class="tab-pane" id="tabPengaturan">
        <!-- Endpoint Setup Section -->
        <div class="settings-section">
          <div class="settings-title">
            ${icons.fileSpreadsheet} Konfigurasi Google Sheets API
          </div>
          <div class="input-group" style="margin-bottom:12px;">
            <label for="settingEndpointUrl">Web App URL Google Apps Script</label>
            <input type="url" class="input-control" id="settingEndpointUrl" 
              placeholder="https://script.google.com/macros/s/.../exec" 
              value="${state.endpointUrl}" />
            <p style="font-size:11px; color:var(--text-muted); margin-top:6px;">
              Dapatkan URL ini setelah menerapkan (Deploy) Apps Script dengan akses "Anyone".
            </p>
          </div>

          <div style="display:flex; gap:8px;">
            <button class="btn-primary" id="btnSaveEndpoint" style="flex:1;">
              ${icons.check} Simpan URL
            </button>
            <button class="btn-secondary" id="btnTestConnection" style="flex:1;">
              ${icons.refresh} Tes Koneksi
            </button>
          </div>

          <!-- Quick Demo Mode button -->
          <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--card-border);">
            <button class="btn-secondary" id="btnAutoSetupSheets" style="width:100%; font-size:12px;">
              ${icons.cloudUpload} Setup Otomatis Tabel Spreadsheet
            </button>
            <p style="font-size:10px; color:var(--text-muted); margin-top:4px; text-align:center;">
              Otomatis membuat sheet 'Siswa', 'Presensi', 'Guru' di Google Sheet Anda.
            </p>
          </div>
        </div>

        <!-- Akun Guru & Sesi -->
        <div class="settings-section">
          <div class="settings-title">
            ${icons.user} Akun Guru Aktif
          </div>
          <div class="conf-row">
            <span class="conf-label">Nama Guru</span>
            <span class="conf-value" id="settingTeacherName">${state.currentGuru?.nama_guru || '-'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">ID Guru</span>
            <span class="conf-value" id="settingTeacherId">${state.currentGuru?.id_guru || '-'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Wali Kelas</span>
            <span class="conf-value" id="settingTeacherWali">${state.currentGuru?.wali_kelas || '-'}</span>
          </div>
          <button class="btn-secondary" id="btnSettingsSwitchGuru" style="width:100%; margin-top:12px;">
            ${icons.logIn} Ganti Akun Guru
          </button>
        </div>

        <!-- Informasi Aplikasi -->
        <div class="settings-section">
          <div class="settings-title">
            ${icons.shieldCheck} Informasi Sistem
          </div>
          <div class="conf-row">
            <span class="conf-label">Versi Aplikasi</span>
            <span class="conf-value">v1.2.0 (Build APK Native)</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Mode Penyimpanan</span>
            <span class="conf-value">${state.endpointUrl ? 'Online Cloud (Sheets)' : 'Offline Local Storage'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Antrean Offline</span>
            <span class="conf-value">${state.offlineQueue.length} item</span>
          </div>
        </div>
      </section>
    </main>

    <!-- Sticky Bottom Summary Bar (Hanya tampil di Tab Presensi) -->
    <div class="sticky-summary-bar" id="stickySummaryBar">
      <div class="summary-badges">
        <div class="summary-pill pill-H" title="Hadir">
          <span>H:</span><b id="countHadir">0</b>
        </div>
        <div class="summary-pill pill-I" title="Izin">
          <span>I:</span><b id="countIzin">0</b>
        </div>
        <div class="summary-pill pill-S" title="Sakit">
          <span>S:</span><b id="countSakit">0</b>
        </div>
        <div class="summary-pill pill-A" title="Alpa">
          <span>A:</span><b id="countAlpa">0</b>
        </div>
      </div>
      <button class="btn-submit-main" id="btnOpenSubmitConfirm">
        ${icons.send} Simpan
      </button>
    </div>

    <!-- Bottom Navigation Bar -->
    <nav class="bottom-nav">
      <button class="nav-item active" data-tab="presensi">
        ${icons.checkCircle}
        <span>Presensi</span>
      </button>
      <button class="nav-item" data-tab="riwayat">
        ${icons.history}
        <span>Riwayat</span>
      </button>
      <button class="nav-item" data-tab="rekap">
        ${icons.barChart}
        <span>Rekap</span>
      </button>
      <button class="nav-item" data-tab="pengaturan">
        ${icons.settings}
        <span>Pengaturan</span>
      </button>
    </nav>

    <!-- Confirmation Modal / Bottom Sheet -->
    <div class="modal-overlay" id="confirmModal">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title">Konfirmasi Simpan Presensi</div>
        <div class="modal-desc">Periksa kembali ringkasan kehadiran siswa sebelum dikirim ke Google Sheets:</div>

        <div class="confirmation-card">
          <div class="conf-row">
            <span class="conf-label">Tanggal Presensi:</span>
            <span class="conf-value" id="confModalTanggal">-</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Kelas:</span>
            <span class="conf-value" id="confModalKelas">-</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Guru Pencatat:</span>
            <span class="conf-value" id="confModalGuru">-</span>
          </div>
          <div class="conf-row" style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--card-border);">
            <span class="conf-label">Rincian Siswa:</span>
            <span class="conf-value" id="confModalBreakdown">Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Total Siswa:</span>
            <span class="conf-value" id="confModalTotal">0 Siswa</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelSubmit">Batal</button>
          <button class="btn-primary" id="btnConfirmAndSend">
            ${icons.send} Kirim Sekarang
          </button>
        </div>
      </div>
    </div>

    <!-- Login / Switch Guru Modal -->
    <div class="modal-overlay" id="guruModal">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title">Pilih / Ganti Akun Guru</div>
        <div class="modal-desc">Pilih nama Anda dari daftar pengajar atau masukkan PIN verifikasi.</div>

        <div class="input-group" style="margin-bottom:12px;">
          <label for="selectLoginGuru">Pilih Nama Guru</label>
          <select class="select-control" id="selectLoginGuru">
            <!-- Rendered dynamically -->
          </select>
        </div>

        <div class="input-group" style="margin-bottom:16px;">
          <label for="inputGuruPin">PIN / Password (Default: 1234)</label>
          <input type="password" class="input-control" id="inputGuruPin" placeholder="Masukkan 4 digit PIN..." value="1234" />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelGuruLogin">Tutup</button>
          <button class="btn-primary" id="btnSubmitGuruLogin">
            ${icons.logIn} Masuk
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container -->
    <div class="toast-container" id="toastContainer"></div>

    <!-- Fullscreen Loading Spinner Overlay -->
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingText">Memproses data...</div>
    </div>
  `;

  // Pasang Event Listeners
  attachEventListeners();
}

// --- Pasang Event Listeners ---
function attachEventListeners() {
  // 1. Bottom Navigation Tabs
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // 2. Filter Kelas & Tanggal
  const selectKelas = document.getElementById('selectKelas');
  selectKelas.addEventListener('change', async (e) => {
    state.selectedKelas = e.target.value;
    await loadSiswaForCurrentKelas();
  });

  const inputTanggal = document.getElementById('inputTanggal');
  inputTanggal.addEventListener('change', (e) => {
    state.selectedTanggal = e.target.value;
    updateSummaryCounters();
  });

  // 3. Tombol Set Semua Hadir
  document.getElementById('btnSetSemuaHadir').addEventListener('click', () => {
    setSemuaHadir();
  });

  // 4. Pencarian Siswa
  const inputSearch = document.getElementById('inputSearchSiswa');
  inputSearch.addEventListener('input', (e) => {
    state.searchQuery = (e.target.value || '').toLowerCase();
    renderStudentList();
  });

  // 5. Submit Confirmation Modal
  document.getElementById('btnOpenSubmitConfirm').addEventListener('click', () => {
    openSubmitConfirmModal();
  });

  document.getElementById('btnCancelSubmit').addEventListener('click', () => {
    closeModal('confirmModal');
  });

  document.getElementById('btnConfirmAndSend').addEventListener('click', async () => {
    await sendPresensiToBackend();
  });

  // 6. Ganti Guru Modal
  document.getElementById('btnSwitchGuru').addEventListener('click', () => {
    openGuruModal();
  });
  document.getElementById('btnSettingsSwitchGuru').addEventListener('click', () => {
    openGuruModal();
  });
  document.getElementById('btnCancelGuruLogin').addEventListener('click', () => {
    closeModal('guruModal');
  });
  document.getElementById('btnSubmitGuruLogin').addEventListener('click', async () => {
    await handleGuruLogin();
  });

  // 7. Pengaturan: Simpan & Tes Endpoint URL
  document.getElementById('btnSaveEndpoint').addEventListener('click', async () => {
    const inputUrl = document.getElementById('settingEndpointUrl').value.trim();
    await storage.setEndpointUrl(inputUrl);
    state.endpointUrl = inputUrl;
    updateNetworkStatusUI();
    showToast('URL Google Apps Script berhasil disimpan!', 'success');
    await loadInitData();
  });

  document.getElementById('btnTestConnection').addEventListener('click', async () => {
    await runTestConnection();
  });

  document.getElementById('btnAutoSetupSheets').addEventListener('click', async () => {
    await runAutoSetupSheets();
  });

  // 8. Offline Queue Sync Button
  document.getElementById('btnSyncOffline').addEventListener('click', async () => {
    await syncOfflineQueue();
  });

  // 9. Riwayat & Rekap Load Buttons
  document.getElementById('btnLoadHistory').addEventListener('click', async () => {
    await loadRiwayatData();
  });

  document.getElementById('btnLoadRekap').addEventListener('click', async () => {
    await loadRekapData();
  });

  // 10. Toggle Theme
  document.getElementById('btnToggleTheme').addEventListener('click', async () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    await storage.setThemeMode(state.theme);
    document.getElementById('btnToggleTheme').innerHTML = state.theme === 'dark' ? icons.sun : icons.moon;
  });
}

// --- Switch Tabs ---
function switchTab(tabName) {
  state.activeTab = tabName;
  feedback.playTap();

  // Update Nav Items
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update Panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const targetPane = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (targetPane) targetPane.classList.add('active');

  // Sticky bottom bar hanya tampil di Tab Presensi
  const stickyBar = document.getElementById('stickySummaryBar');
  if (tabName === 'presensi') {
    stickyBar.style.display = 'flex';
  } else {
    stickyBar.style.display = 'none';
  }
}

// --- Load Initial Data (Guru & Kelas) ---
async function loadInitData() {
  try {
    const res = await api.getInitData(state.endpointUrl);
    if (res.guruList && res.guruList.length > 0) {
      state.guruList = res.guruList;
      if (!state.currentGuru) {
        state.currentGuru = res.guruList[0];
        await storage.setCurrentGuru(state.currentGuru);
      }
    }
    if (res.kelasList && res.kelasList.length > 0) {
      state.kelasList = res.kelasList;
      updateKelasDropdowns();
    }
    updateTeacherUI();
  } catch (err) {
    console.warn('Gagal muat init data:', err);
  }
}

// --- Update Dropdowns Kelas ---
function updateKelasDropdowns() {
  const ids = ['selectKelas', 'historySelectKelas', 'rekapSelectKelas'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = state.kelasList.map(k => `
        <option value="${k}" ${k === state.selectedKelas ? 'selected' : ''}>Kelas ${k}</option>
      `).join('');
    }
  });
}

// --- Load Siswa untuk Kelas Terpilih ---
async function loadSiswaForCurrentKelas() {
  showLoading('Memuat daftar siswa...');
  try {
    const list = await api.getSiswaList(state.endpointUrl, state.selectedKelas);
    state.siswaList = list || [];

    // Reset atau Inisialisasi status kehadiran ke default: 'Hadir'
    state.attendanceMap = {};
    state.siswaList.forEach(s => {
      state.attendanceMap[s.id_siswa] = {
        status: 'Hadir',
        keterangan: ''
      };
    });

    renderStudentList();
    updateSummaryCounters();
  } catch (err) {
    showToast('Gagal memuat siswa: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Render Daftar Siswa ---
function renderStudentList() {
  const container = document.getElementById('studentListContainer');
  if (!container) return;

  const filtered = state.siswaList.filter(s => {
    if (!state.searchQuery) return true;
    const matchName = (s.nama || '').toLowerCase().includes(state.searchQuery);
    const matchNisn = (s.nisn || '').toLowerCase().includes(state.searchQuery);
    return matchName || matchNisn;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icons.users}</div>
        <p>Tidak ada data siswa ditemukan untuk kelas <b>${state.selectedKelas}</b>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((siswa, idx) => {
    const att = state.attendanceMap[siswa.id_siswa] || { status: 'Hadir', keterangan: '' };
    const initialStatus = att.status;
    const initialStatusLower = initialStatus.charAt(0).toUpperCase();

    return `
      <div class="student-card status-${initialStatusLower}" id="card-student-${siswa.id_siswa}">
        <div class="student-card-header">
          <div class="student-identity">
            <div class="student-avatar gender-${siswa.jenis_kelamin}">
              ${getInitials(siswa.nama)}
            </div>
            <div class="student-names">
              <div class="student-name">${idx + 1}. ${siswa.nama}</div>
              <div class="student-meta">
                <span>NISN: ${siswa.nisn || '-'}</span>
                <span class="gender-tag ${siswa.jenis_kelamin}">${siswa.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 Status Chips: Hadir, Izin, Sakit, Alpa -->
        <div class="status-chips-group">
          <button class="status-chip chip-H ${initialStatus === 'Hadir' ? 'active' : ''}" 
            data-id="${siswa.id_siswa}" data-status="Hadir">
            <span class="chip-code">H</span>
            <span class="chip-label">Hadir</span>
          </button>
          <button class="status-chip chip-I ${initialStatus === 'Izin' ? 'active' : ''}" 
            data-id="${siswa.id_siswa}" data-status="Izin">
            <span class="chip-code">I</span>
            <span class="chip-label">Izin</span>
          </button>
          <button class="status-chip chip-S ${initialStatus === 'Sakit' ? 'active' : ''}" 
            data-id="${siswa.id_siswa}" data-status="Sakit">
            <span class="chip-code">S</span>
            <span class="chip-label">Sakit</span>
          </button>
          <button class="status-chip chip-A ${initialStatus === 'Alpa' ? 'active' : ''}" 
            data-id="${siswa.id_siswa}" data-status="Alpa">
            <span class="chip-code">A</span>
            <span class="chip-label">Alpa</span>
          </button>
        </div>

        <!-- Keterangan Accordion (Muncul jika status bukan Hadir) -->
        <div class="note-accordion ${initialStatus !== 'Hadir' ? 'visible' : ''}" id="note-box-${siswa.id_siswa}">
          <input type="text" class="note-input" id="note-input-${siswa.id_siswa}" 
            placeholder="Catatan / keterangan..." 
            value="${att.keterangan || ''}" />
          <div class="note-chips">
            <span class="note-preset" data-id="${siswa.id_siswa}" data-note="Demam / Sakit">Demam</span>
            <span class="note-preset" data-id="${siswa.id_siswa}" data-note="Acara Keluarga">Acara Keluarga</span>
            <span class="note-preset" data-id="${siswa.id_siswa}" data-note="Surat Dokter">Surat Dokter</span>
            <span class="note-preset" data-id="${siswa.id_siswa}" data-note="Tanpa Kabar">Tanpa Kabar</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach status chip event listeners
  container.querySelectorAll('.status-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const button = e.currentTarget;
      const idSiswa = button.getAttribute('data-id');
      const newStatus = button.getAttribute('data-status');
      setStatusForStudent(idSiswa, newStatus);
    });
  });

  // Attach note input event listeners
  container.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idSiswa = e.target.id.replace('note-input-', '');
      if (state.attendanceMap[idSiswa]) {
        state.attendanceMap[idSiswa].keterangan = e.target.value;
      }
    });
  });

  // Attach note preset chips
  container.querySelectorAll('.note-preset').forEach(preset => {
    preset.addEventListener('click', (e) => {
      const idSiswa = e.currentTarget.getAttribute('data-id');
      const noteText = e.currentTarget.getAttribute('data-note');
      const inputEl = document.getElementById(`note-input-${idSiswa}`);
      if (inputEl) {
        inputEl.value = noteText;
        if (state.attendanceMap[idSiswa]) {
          state.attendanceMap[idSiswa].keterangan = noteText;
        }
        feedback.playTap();
      }
    });
  });
}

// --- Set Status Kehadiran Per Siswa ---
function setStatusForStudent(idSiswa, status) {
  feedback.playTap();

  if (!state.attendanceMap[idSiswa]) {
    state.attendanceMap[idSiswa] = { status: 'Hadir', keterangan: '' };
  }
  state.attendanceMap[idSiswa].status = status;

  // Update styling card
  const card = document.getElementById(`card-student-${idSiswa}`);
  if (card) {
    card.classList.remove('status-H', 'status-I', 'status-S', 'status-A');
    card.classList.add(`status-${status.charAt(0).toUpperCase()}`);

    // Update active status chips
    card.querySelectorAll('.status-chip').forEach(c => {
      if (c.getAttribute('data-status') === status) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    // Expand/collapse note accordion
    const noteBox = document.getElementById(`note-box-${idSiswa}`);
    if (noteBox) {
      if (status !== 'Hadir') {
        noteBox.classList.add('visible');
      } else {
        noteBox.classList.remove('visible');
      }
    }
  }

  updateSummaryCounters();
}

// --- Set Semua Hadir ---
function setSemuaHadir() {
  feedback.playTap();
  state.siswaList.forEach(s => {
    if (!state.attendanceMap[s.id_siswa]) {
      state.attendanceMap[s.id_siswa] = { status: 'Hadir', keterangan: '' };
    } else {
      state.attendanceMap[s.id_siswa].status = 'Hadir';
    }
  });

  renderStudentList();
  updateSummaryCounters();
  showToast(`Semua siswa kelas ${state.selectedKelas} disetel HADIR!`, 'success');
}

// --- Update Summary Counters Real-Time ---
function updateSummaryCounters() {
  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpa = 0;

  Object.values(state.attendanceMap).forEach(item => {
    const st = (item.status || 'Hadir').toLowerCase();
    if (st === 'hadir') hadir++;
    else if (st === 'izin') izin++;
    else if (st === 'sakit') sakit++;
    else if (st === 'alpa') alpa++;
  });

  document.getElementById('countHadir').textContent = hadir;
  document.getElementById('countIzin').textContent = izin;
  document.getElementById('countSakit').textContent = sakit;
  document.getElementById('countAlpa').textContent = alpa;
}

// --- Open Submit Confirmation Modal ---
function openSubmitConfirmModal() {
  feedback.playTap();

  if (state.siswaList.length === 0) {
    showToast('Daftar siswa masih kosong.', 'warning');
    return;
  }

  let hadir = 0, izin = 0, sakit = 0, alpa = 0;
  Object.values(state.attendanceMap).forEach(item => {
    const st = (item.status || 'Hadir').toLowerCase();
    if (st === 'hadir') hadir++;
    else if (st === 'izin') izin++;
    else if (st === 'sakit') sakit++;
    else if (st === 'alpa') alpa++;
  });

  document.getElementById('confModalTanggal').textContent = formatDateIndo(state.selectedTanggal);
  document.getElementById('confModalKelas').textContent = 'Kelas ' + state.selectedKelas;
  document.getElementById('confModalGuru').textContent = state.currentGuru?.nama_guru || 'Guru Pengajar';
  document.getElementById('confModalBreakdown').textContent = `Hadir: ${hadir} | Izin: ${izin} | Sakit: ${sakit} | Alpa: ${alpa}`;
  document.getElementById('confModalTotal').textContent = `${state.siswaList.length} Siswa`;

  openModal('confirmModal');
}

// --- Kirim Presensi ke Google Sheets ---
async function sendPresensiToBackend() {
  closeModal('confirmModal');
  showLoading('Mengirim data presensi ke Google Sheets...');

  try {
    const items = state.siswaList.map(s => {
      const att = state.attendanceMap[s.id_siswa] || { status: 'Hadir', keterangan: '' };
      return {
        id_siswa: s.id_siswa,
        nama: s.nama,
        kelas: state.selectedKelas,
        status: att.status || 'Hadir',
        keterangan: att.keterangan || ''
      };
    });

    const payload = {
      tanggal: state.selectedTanggal,
      kelas: state.selectedKelas,
      nama_guru: state.currentGuru?.nama_guru || 'Guru',
      items: items
    };

    const res = await api.submitPresensi(state.endpointUrl, payload);

    if (res.status === 'success') {
      feedback.playSuccess();
      showToast(`Presensi kelas ${state.selectedKelas} berhasil disimpan ke Spreadsheet!`, 'success');
    } else if (res.status === 'offline_saved' || res.status === 'offline') {
      feedback.playAlert();
      showToast(res.message, 'warning');
      state.offlineQueue = await storage.getOfflineQueue();
      updateOfflineQueueBanner();
    } else {
      throw new Error(res.message || 'Gagal menyimpan.');
    }
  } catch (err) {
    feedback.playAlert();
    showToast('Terjadi kesalahan: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Riwayat Presensi ---
async function loadRiwayatData() {
  const kelas = document.getElementById('historySelectKelas').value;
  const tanggal = document.getElementById('historyInputTanggal').value;
  const container = document.getElementById('historyResultContainer');

  if (!container) return;
  showLoading('Memuat riwayat presensi...');

  try {
    const list = await api.getPresensiHistory(state.endpointUrl, tanggal, kelas);
    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.history}</div>
          <p>Belum ada data presensi yang diinput untuk <b>Kelas ${kelas}</b> pada tanggal <b>${formatDateIndo(tanggal)}</b>.</p>
        </div>
      `;
      return;
    }

    let h = 0, i = 0, s = 0, a = 0;
    list.forEach(item => {
      const st = (item.status || '').toLowerCase();
      if (st === 'hadir') h++;
      else if (st === 'izin') i++;
      else if (st === 'sakit') s++;
      else if (st === 'alpa') a++;
    });

    container.innerHTML = `
      <div class="confirmation-card" style="margin-bottom:14px;">
        <div class="conf-row">
          <span class="conf-label">Guru Pencatat</span>
          <span class="conf-value">${list[0]?.nama_guru || '-'}</span>
        </div>
        <div class="conf-row">
          <span class="conf-label">Terakhir Disimpan</span>
          <span class="conf-value">${list[0]?.timestamp || '-'}</span>
        </div>
        <div class="conf-row" style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--card-border);">
          <span class="conf-label">Ringkasan</span>
          <span class="conf-value">H: ${h} | I: ${i} | S: ${s} | A: ${a} (${list.length} Siswa)</span>
        </div>
      </div>

      <div class="student-list">
        ${list.map((item, idx) => `
          <div class="history-card">
            <div>
              <div style="font-weight:700; font-size:13px;">${idx + 1}. ${item.nama}</div>
              <div style="font-size:11px; color:var(--text-muted);">
                ${item.keterangan ? 'Ket: ' + item.keterangan : 'Tanpa catatan khusus'}
              </div>
            </div>
            <span class="summary-pill pill-${item.status.charAt(0).toUpperCase()}">
              ${item.status}
            </span>
          </div>
        `).join('')}
      </div>
    `;
    feedback.playTap();
  } catch (err) {
    showToast('Gagal memuat riwayat: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Rekapitulasi Presensi ---
async function loadRekapData() {
  const kelas = document.getElementById('rekapSelectKelas').value;
  const bulan = document.getElementById('rekapSelectBulan').value;
  const container = document.getElementById('rekapResultContainer');

  if (!container) return;
  showLoading('Menghitung rekapitulasi...');

  try {
    const rekapList = await api.getRekapData(state.endpointUrl, kelas, bulan);
    if (!rekapList || rekapList.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.barChart}</div>
          <p>Belum ada data rekap presensi untuk <b>Kelas ${kelas}</b> periode <b>${bulan}</b>.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="rekap-table-container">
        <table class="rekap-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Siswa</th>
              <th style="color:var(--color-hadir);">H</th>
              <th style="color:var(--color-izin);">I</th>
              <th style="color:var(--color-sakit);">S</th>
              <th style="color:var(--color-alpa);">A</th>
              <th>% Hadir</th>
            </tr>
          </thead>
          <tbody>
            ${rekapList.map((item, idx) => {
              const total = item.hadir + item.izin + item.sakit + item.alpa;
              const persentase = total > 0 ? Math.round((item.hadir / total) * 100) : 100;
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-weight:600;">${item.nama}</td>
                  <td style="font-weight:700; color:var(--color-hadir);">${item.hadir}</td>
                  <td>${item.izin}</td>
                  <td>${item.sakit}</td>
                  <td style="font-weight:700; color:var(--color-alpa);">${item.alpa}</td>
                  <td style="font-weight:800;">${persentase}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    feedback.playTap();
  } catch (err) {
    showToast('Gagal memuat rekap: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Tes Koneksi Google Apps Script ---
async function runTestConnection() {
  const inputUrl = document.getElementById('settingEndpointUrl').value.trim();
  if (!inputUrl) {
    showToast('Harap masukkan URL Google Apps Script terlebih dahulu.', 'warning');
    return;
  }

  showLoading('Menghubungkan ke Google Apps Script...');
  try {
    const res = await api.testConnection(inputUrl);
    feedback.playSuccess();
    showToast(`Koneksi Sukses! Terhubung ke "${res.spreadsheetTitle}"`, 'success');
    state.endpointUrl = inputUrl;
    await storage.setEndpointUrl(inputUrl);
    updateNetworkStatusUI();
  } catch (err) {
    feedback.playAlert();
    showToast('Koneksi Gagal: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Auto Setup Sheet di Google Sheets ---
async function runAutoSetupSheets() {
  const inputUrl = document.getElementById('settingEndpointUrl').value.trim();
  if (!inputUrl) {
    showToast('Masukkan URL Apps Script terlebih dahulu.', 'warning');
    return;
  }

  showLoading('Membuat sheet Siswa, Presensi, dan Guru...');
  try {
    const res = await api.setupRemoteSheets(inputUrl);
    feedback.playSuccess();
    showToast(res.message || 'Tabel Spreadsheet berhasil dibuat!', 'success');
    await loadInitData();
    await loadSiswaForCurrentKelas();
  } catch (err) {
    showToast('Gagal setup sheets: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Sinkronisasi Antrean Offline ---
async function syncOfflineQueue() {
  if (state.offlineQueue.length === 0) return;
  if (!state.endpointUrl) {
    showToast('Atur Web App URL di Pengaturan terlebih dahulu.', 'warning');
    return;
  }

  showLoading(`Menyinkronkan ${state.offlineQueue.length} antrean presensi...`);
  try {
    let successCount = 0;
    const remaining = [];

    for (const item of state.offlineQueue) {
      try {
        const res = await api.submitPresensi(state.endpointUrl, item.payload);
        if (res.status === 'success') {
          successCount++;
        } else {
          remaining.push(item);
        }
      } catch (e) {
        remaining.push(item);
      }
    }

    state.offlineQueue = remaining;
    await storage.set('presensi_offline_queue', remaining);
    updateOfflineQueueBanner();

    if (successCount > 0) {
      feedback.playSuccess();
      showToast(`${successCount} presensi offline berhasil disinkronkan ke Spreadsheet!`, 'success');
    }
  } catch (err) {
    showToast('Gagal sinkronisasi: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Modal Guru (Switch Account / Login) ---
function openGuruModal() {
  const select = document.getElementById('selectLoginGuru');
  if (select) {
    select.innerHTML = state.guruList.map(g => `
      <option value="${g.id_guru}" ${g.id_guru === state.currentGuru?.id_guru ? 'selected' : ''}>
        ${g.nama_guru} (Wali: ${g.wali_kelas || '-'})
      </option>
    `).join('');
  }
  openModal('guruModal');
}

async function handleGuruLogin() {
  const idGuru = document.getElementById('selectLoginGuru').value;
  const pin = document.getElementById('inputGuruPin').value.trim();
  const targetGuru = state.guruList.find(g => g.id_guru === idGuru);

  if (!targetGuru) {
    showToast('Guru tidak ditemukan.', 'warning');
    return;
  }

  // Verifikasi PIN
  if (targetGuru.pin && pin && targetGuru.pin !== pin) {
    feedback.playAlert();
    showToast('PIN / Password salah! (Default: 1234)', 'error');
    return;
  }

  state.currentGuru = targetGuru;
  await storage.setCurrentGuru(targetGuru);
  updateTeacherUI();
  closeModal('guruModal');
  feedback.playSuccess();
  showToast(`Selamat mengajar, ${targetGuru.nama_guru}!`, 'success');
}

function updateTeacherUI() {
  if (!state.currentGuru) return;
  const name = state.currentGuru.nama_guru;
  const wali = state.currentGuru.wali_kelas || '-';

  const avatar = document.getElementById('headerTeacherAvatar');
  if (avatar) avatar.textContent = getInitials(name);

  const headerName = document.getElementById('headerTeacherName');
  if (headerName) headerName.textContent = name;

  const headerRole = document.getElementById('headerTeacherRole');
  if (headerRole) headerRole.textContent = `Wali Kelas: ${wali}`;

  const setName = document.getElementById('settingTeacherName');
  if (setName) setName.textContent = name;

  const setId = document.getElementById('settingTeacherId');
  if (setId) setId.textContent = state.currentGuru.id_guru;

  const setWali = document.getElementById('settingTeacherWali');
  if (setWali) setWali.textContent = wali;
}

function updateNetworkStatusUI() {
  const badge = document.getElementById('connectionBadge');
  const text = document.getElementById('connectionBadgeText');
  if (!badge || !text) return;

  if (state.endpointUrl && state.isOnline) {
    badge.className = 'status-badge online';
    badge.innerHTML = `${icons.wifi} <span>Sheets Aktif</span>`;
  } else {
    badge.className = 'status-badge offline';
    badge.innerHTML = `${icons.wifiOff} <span>Mode Offline</span>`;
  }
}

function updateOfflineQueueBanner() {
  const banner = document.getElementById('offlineQueueBanner');
  const count = document.getElementById('offlineQueueCount');
  if (!banner || !count) return;

  if (state.offlineQueue.length > 0) {
    banner.style.display = 'flex';
    count.textContent = state.offlineQueue.length;
  } else {
    banner.style.display = 'none';
  }
}

// --- Utilitas Modal, Loading, Toast, Format ---
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showLoading(text = 'Memuat...') {
  const el = document.getElementById('loadingOverlay');
  const txt = document.getElementById('loadingText');
  if (txt) txt.textContent = text;
  if (el) el.classList.add('open');
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.remove('open');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? icons.checkCircle : (type === 'error' ? icons.alertCircle : icons.shieldCheck)}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function getInitials(name) {
  if (!name) return 'S';
  const parts = name.replace(/Drs\.|M\.Pd|S\.Pd|S\.Kom|H\./g, '').trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[2], 10);
    const m = months[parseInt(parts[1], 10) - 1];
    const y = parts[0];
    return `${d} ${m} ${y}`;
  }
  return dateStr;
}

// Jalankan Aplikasi
window.addEventListener('DOMContentLoaded', initApp);
