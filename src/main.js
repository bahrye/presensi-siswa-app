/**
 * =========================================================================
 * APLIKASI PRESENSI SISWA - MASTER CENTRALIZED MULTI-SCHOOL
 * 1 Master Google Apps Script untuk Melayani Banyak Sekolah
 * Dukungan Penuh Guru Satminkal & Non-Satminkal
 * =========================================================================
 */

import './style.css';
import { storage } from './services/storage';
import { api } from './services/api';
import { feedback } from './services/sound';
import { icons } from './components/Icons';

// --- State Aplikasi ---
const state = {
  session: null, // null | { role: 'guru', guru: {...}, id_sekolah: '...' } | { role: 'admin', id_sekolah: '...' }
  activeLoginRole: 'guru', // 'guru' | 'admin'
  endpointUrl: '',
  schoolsList: [],
  selectedSchoolId: 'SCH01',
  selectedSchool: null,
  currentGuru: null,
  guruList: [],
  kelasList: ['7A', '7B', '8A'],
  selectedKelas: '7A',
  selectedTanggal: new Date().toISOString().split('T')[0],
  siswaList: [],
  attendanceMap: {}, // { [id_siswa]: { status: 'Hadir' | 'Izin' | 'Sakit' | 'Alpa', keterangan: '' } }
  searchQuery: '',
  activeTab: 'presensi', // 'presensi' | 'riwayat' | 'rekap' | 'akun'
  offlineQueue: [],
  isOnline: navigator.onLine,
  theme: 'light'
};

// --- Inisialisasi Aplikasi ---
async function initApp() {
  // 1. Muat Tema Tampilan
  state.theme = await storage.getThemeMode();
  document.documentElement.setAttribute('data-theme', state.theme);

  // 2. Muat Konfigurasi & Sesi
  state.endpointUrl = await storage.getEndpointUrl();
  state.offlineQueue = await storage.getOfflineQueue();
  state.session = await storage.getSession();

  // 3. Muat Data Sekolah
  state.schoolsList = await storage.getSchools();
  state.selectedSchoolId = await storage.getActiveSchoolId();

  // Jika ada sesi aktif, utamakan id_sekolah dari sesi
  if (state.session && state.session.id_sekolah) {
    state.selectedSchoolId = state.session.id_sekolah;
  }

  state.selectedSchool = state.schoolsList.find(s => s.id_sekolah === state.selectedSchoolId) || state.schoolsList[0];
  if (state.selectedSchool) {
    state.selectedSchoolId = state.selectedSchool.id_sekolah;
  }

  // 4. Muat Data Guru & Kelas khusus Sekolah Terpilih
  state.guruList = await storage.getCachedGuruList(state.selectedSchoolId);
  state.kelasList = await storage.getCachedKelasList(state.selectedSchoolId);
  if (state.kelasList.length > 0) {
    state.selectedKelas = state.kelasList[0];
  }

  // 5. Cek Status Sesi Login
  if (!state.session) {
    renderLoginScreen();
  } else if (state.session.role === 'admin') {
    renderAdminDashboard();
  } else if (state.session.role === 'guru') {
    state.currentGuru = state.session.guru;
    if (state.currentGuru?.wali_kelas && state.kelasList.includes(state.currentGuru.wali_kelas)) {
      state.selectedKelas = state.currentGuru.wali_kelas;
    }
    renderGuruApp();
    await loadSiswaForCurrentKelas();
  }

  // 6. Sinkronisasi Data Online di Background jika terhubung
  if (state.endpointUrl && navigator.onLine) {
    silentSyncInitData();
  }

  // 7. Event Listeners Status Jaringan
  window.addEventListener('online', () => {
    state.isOnline = true;
    updateNetworkStatusUI();
    showToast('Koneksi internet aktif!', 'success');
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    updateNetworkStatusUI();
    showToast('Mode offline aktif. Presensi tersimpan di penyimpanan lokal.', 'warning');
  });
}

// =========================================================================
// 1. HALAMAN LOGIN MULTI-SEKOLAH (GURU / ADMIN SEKOLAH)
// =========================================================================
function renderLoginScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-view">
      <div class="login-brand-header">
        <div class="login-app-logo">
          <img src="/app-icon.jpg" alt="Logo Presensi Siswa" onerror="this.innerHTML='PS'" />
        </div>
        <h1 class="login-title">Presensi Siswa</h1>
        <p class="login-subtitle">Sistem Kehadiran Terpusat Multi-Sekolah</p>
      </div>

      <!-- School Selector Card (Multi-Tenant Selector) -->
      <div class="school-selector-card">
        <div class="school-selector-header">
          <span>${icons.settings} Sekolah Yang Dituju</span>
          <button class="btn-add-school" id="btnOpenModalAddSchool" title="Daftarkan Sekolah Baru">
            ${icons.plus} Daftarkan Sekolah
          </button>
        </div>
        <div class="school-dropdown-row">
          <select class="select-control" id="selectSchoolLogin" style="font-weight:700;">
            ${state.schoolsList.map(s => `
              <option value="${s.id_sekolah}" ${s.id_sekolah === state.selectedSchoolId ? 'selected' : ''}>
                ${s.nama_sekolah} (${s.npsn || s.id_sekolah})
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Segmented Control Role Selector -->
      <div class="role-tab-container">
        <button class="role-tab-btn ${state.activeLoginRole === 'guru' ? 'active' : ''}" id="tabRoleGuru">
          ${icons.user} Guru Pengajar
        </button>
        <button class="role-tab-btn ${state.activeLoginRole === 'admin' ? 'active' : ''}" id="tabRoleAdmin">
          ${icons.lock} Admin Sekolah
        </button>
      </div>

      <!-- Form Card Login Guru -->
      <div class="login-card" id="formLoginGuru" style="${state.activeLoginRole === 'guru' ? '' : 'display:none;'}">
        <div style="font-size:13px; font-weight:700; margin-bottom:14px; color:var(--text-main); display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:6px;">
            ${icons.user} Masuk Sesi Guru
          </div>
          <span class="badge-satminkal" id="badgeCurrentSchool">${state.selectedSchool?.nama_sekolah ? 'Aktif' : '-'}</span>
        </div>

        <div class="input-group" style="margin-bottom:14px;">
          <label for="loginSelectGuru">Pilih Nama Guru</label>
          <select class="select-control" id="loginSelectGuru">
            ${state.guruList.length > 0 ? state.guruList.map(g => `
              <option value="${g.id_guru}">
                ${g.nama_guru} [${g.status_guru || 'Satminkal'}] (ID: ${g.id_guru} | Wali: ${g.wali_kelas || '-'})
              </option>
            `).join('') : '<option value="">- Belum ada guru di sekolah ini -</option>'}
          </select>
        </div>

        <div class="input-group" style="margin-bottom:20px;">
          <label for="loginGuruPin">PIN Guru (Default: 1234)</label>
          <input type="password" class="input-control" id="loginGuruPin" placeholder="Masukkan PIN..." value="1234" maxlength="10" />
        </div>

        <button class="btn-primary" id="btnSubmitLoginGuru" style="width:100%; padding:12px; font-size:14px;">
          ${icons.logIn} Masuk sebagai Guru
        </button>
      </div>

      <!-- Form Card Login Admin -->
      <div class="login-card" id="formLoginAdmin" style="${state.activeLoginRole === 'admin' ? '' : 'display:none;'}">
        <div class="admin-badge-indicator">
          ${icons.lock} Administrator: ${state.selectedSchool?.nama_sekolah || 'Sekolah'}
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
          Kelola data siswa, guru Satminkal/Non-Satminkal, dan rekap khusus untuk <b>${state.selectedSchool?.nama_sekolah || 'sekolah ini'}</b>.
        </p>

        <div class="input-group" style="margin-bottom:20px;">
          <label for="loginAdminPin">PIN Admin Sekolah (Default: admin123)</label>
          <input type="password" class="input-control" id="loginAdminPin" placeholder="Masukkan PIN Admin..." value="admin123" />
        </div>

        <button class="btn-primary" id="btnSubmitLoginAdmin" style="width:100%; padding:12px; font-size:14px; background:linear-gradient(135deg, #B45309, #D97706);">
          ${icons.lock} Masuk sebagai Admin
        </button>
      </div>

      <div style="text-align:center; margin-top:20px; font-size:11px; color:var(--text-dim);">
        Presensi Siswa Master v2.0 • 1 Master Apps Script Multi-Tenant
      </div>
    </div>

    <!-- Modal Daftarkan Sekolah Baru -->
    <div class="modal-overlay" id="modalAddSchool">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
          ${icons.settings} Daftarkan Sekolah Baru
        </div>
        <div class="modal-desc">Sekolah baru akan didaftarkan ke sistem dan langsung memiliki database terpisah.</div>

        <div class="input-group" style="margin-top:14px; margin-bottom:12px;">
          <label for="inputNewSchoolNama">Nama Resmi Sekolah *</label>
          <input type="text" class="input-control" id="inputNewSchoolNama" placeholder="Contoh: SMP Negeri 2 Bandung..." />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div class="input-group">
            <label for="inputNewSchoolNpsn">NPSN (Opsional)</label>
            <input type="text" class="input-control" id="inputNewSchoolNpsn" placeholder="Nomor NPSN..." />
          </div>
          <div class="input-group">
            <label for="inputNewSchoolPin">PIN Admin Sekolah *</label>
            <input type="password" class="input-control" id="inputNewSchoolPin" placeholder="Default: admin123" value="admin123" />
          </div>
        </div>

        <div class="input-group" style="margin-bottom:18px;">
          <label for="inputNewSchoolAlamat">Alamat Sekolah (Opsional)</label>
          <input type="text" class="input-control" id="inputNewSchoolAlamat" placeholder="Kota / Alamat lengkap..." />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelAddSchool" style="flex:1;">Batal</button>
          <button class="btn-primary" id="btnSubmitAddSchool" style="flex:1;">
            ${icons.check} Daftarkan Sekarang
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container -->
    <div class="toast-container" id="toastContainer"></div>
    <!-- Loading Overlay -->
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingText">Memproses...</div>
    </div>
  `;

  // Listener Pemilih Sekolah (School Switcher)
  const selSchool = document.getElementById('selectSchoolLogin');
  selSchool?.addEventListener('change', async (e) => {
    state.selectedSchoolId = e.target.value;
    state.selectedSchool = state.schoolsList.find(s => s.id_sekolah === state.selectedSchoolId);
    await storage.setActiveSchoolId(state.selectedSchoolId);

    // Muat data guru & kelas sekolah terpilih
    state.guruList = await storage.getCachedGuruList(state.selectedSchoolId);
    state.kelasList = await storage.getCachedKelasList(state.selectedSchoolId);
    if (state.kelasList.length > 0) state.selectedKelas = state.kelasList[0];

    // Perbarui dropdown guru
    const selGuru = document.getElementById('loginSelectGuru');
    if (selGuru) {
      if (state.guruList.length > 0) {
        selGuru.innerHTML = state.guruList.map(g => `
          <option value="${g.id_guru}">
            ${g.nama_guru} [${g.status_guru || 'Satminkal'}] (ID: ${g.id_guru} | Wali: ${g.wali_kelas || '-'})
          </option>
        `).join('');
      } else {
        selGuru.innerHTML = `<option value="">- Belum ada guru di sekolah ini -</option>`;
      }
    }

    // Perbarui label nama sekolah di card admin
    const adminBadge = document.querySelector('.admin-badge-indicator');
    if (adminBadge) {
      adminBadge.innerHTML = `${icons.lock} Administrator: ${state.selectedSchool?.nama_sekolah || 'Sekolah'}`;
    }

    if (state.endpointUrl && navigator.onLine) {
      silentSyncInitData();
    }
  });

  // Modal Daftarkan Sekolah Baru
  document.getElementById('btnOpenModalAddSchool')?.addEventListener('click', () => {
    feedback.playTap();
    openModal('modalAddSchool');
  });

  document.getElementById('btnCancelAddSchool')?.addEventListener('click', () => {
    closeModal('modalAddSchool');
  });

  document.getElementById('btnSubmitAddSchool')?.addEventListener('click', async () => {
    const nama = document.getElementById('inputNewSchoolNama').value.trim();
    const npsn = document.getElementById('inputNewSchoolNpsn').value.trim();
    const pin = document.getElementById('inputNewSchoolPin').value.trim() || 'admin123';
    const alamat = document.getElementById('inputNewSchoolAlamat').value.trim();

    if (!nama) {
      showToast('Nama Sekolah wajib diisi!', 'warning');
      return;
    }

    showLoading('Mendaftarkan sekolah baru...');
    try {
      const res = await api.registerSchool(state.endpointUrl, {
        nama_sekolah: nama,
        npsn: npsn,
        pin_admin: pin,
        alamat: alamat
      });

      feedback.playSuccess();
      showToast(res.message || `Sekolah ${nama} berhasil didaftarkan!`, 'success');
      closeModal('modalAddSchool');

      state.schoolsList = await storage.getSchools();
      if (res.data?.id_sekolah) {
        state.selectedSchoolId = res.data.id_sekolah;
        await storage.setActiveSchoolId(state.selectedSchoolId);
      }
      renderLoginScreen();
    } catch (err) {
      showToast('Gagal mendaftar: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Listeners Role Selector (Guru / Admin)
  document.getElementById('tabRoleGuru').addEventListener('click', () => {
    state.activeLoginRole = 'guru';
    feedback.playTap();
    document.getElementById('tabRoleGuru').classList.add('active');
    document.getElementById('tabRoleAdmin').classList.remove('active');
    document.getElementById('formLoginGuru').style.display = 'block';
    document.getElementById('formLoginAdmin').style.display = 'none';
  });

  document.getElementById('tabRoleAdmin').addEventListener('click', () => {
    state.activeLoginRole = 'admin';
    feedback.playTap();
    document.getElementById('tabRoleAdmin').classList.add('active');
    document.getElementById('tabRoleGuru').classList.remove('active');
    document.getElementById('formLoginAdmin').style.display = 'block';
    document.getElementById('formLoginGuru').style.display = 'none';
  });

  // Submit Login Guru
  document.getElementById('btnSubmitLoginGuru').addEventListener('click', async () => {
    await handleLoginGuruAction();
  });

  // Submit Login Admin
  document.getElementById('btnSubmitLoginAdmin').addEventListener('click', async () => {
    await handleLoginAdminAction();
  });
}

// Proses Login Guru
async function handleLoginGuruAction() {
  const selEl = document.getElementById('loginSelectGuru');
  if (!selEl || !selEl.value) {
    showToast('Pilih guru terlebih dahulu atau daftarkan guru baru oleh admin.', 'warning');
    return;
  }

  const idGuru = selEl.value;
  const pin = document.getElementById('loginGuruPin').value.trim();
  const targetGuru = state.guruList.find(g => g.id_guru === idGuru);

  if (!targetGuru) {
    showToast('Data guru tidak ditemukan di sekolah terpilih.', 'warning');
    return;
  }

  // Verifikasi PIN
  if (targetGuru.pin && pin && targetGuru.pin !== pin) {
    feedback.playAlert();
    showToast('PIN salah! (Default PIN: 1234)', 'error');
    return;
  }

  showLoading('Membuka sesi guru...');
  try {
    state.currentGuru = targetGuru;
    state.session = {
      role: 'guru',
      guru: targetGuru,
      id_sekolah: state.selectedSchoolId,
      nama_sekolah: state.selectedSchool?.nama_sekolah || 'Sekolah'
    };

    await storage.setSession(state.session);
    await storage.setCurrentGuru(targetGuru);

    if (targetGuru.wali_kelas && state.kelasList.includes(targetGuru.wali_kelas)) {
      state.selectedKelas = targetGuru.wali_kelas;
    } else if (state.kelasList.length > 0) {
      state.selectedKelas = state.kelasList[0];
    }

    feedback.playSuccess();
    renderGuruApp();
    await loadSiswaForCurrentKelas();
    showToast(`Selamat datang, ${targetGuru.nama_guru} [${targetGuru.status_guru || 'Satminkal'}]!`, 'success');
  } catch (err) {
    showToast('Gagal masuk: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// Proses Login Admin Sekolah
async function handleLoginAdminAction() {
  const pin = document.getElementById('loginAdminPin').value.trim();
  showLoading('Memverifikasi akses Admin Sekolah...');

  try {
    const res = await api.verifyAdminLogin(state.endpointUrl, state.selectedSchoolId, pin);
    state.session = {
      role: 'admin',
      id_sekolah: state.selectedSchoolId,
      nama_sekolah: state.selectedSchool?.nama_sekolah || 'Sekolah'
    };
    await storage.setSession(state.session);
    feedback.playSuccess();
    renderAdminDashboard();
    showToast(`Berhasil masuk sebagai Admin: ${state.selectedSchool?.nama_sekolah}!`, 'success');
  } catch (err) {
    feedback.playAlert();
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// Logout & Kembali ke Layar Login
function handleLogout() {
  feedback.playTap();
  openModal('logoutModal');
}

async function performLogout() {
  feedback.playTap();
  closeModal('logoutModal');
  showLoading('Keluar dari sesi...');
  try {
    await storage.clearSession();
    state.session = null;
    state.currentGuru = null;
    setTimeout(() => {
      hideLoading();
      renderLoginScreen();
      showToast('Anda telah berhasil keluar.', 'info');
    }, 200);
  } catch (e) {
    hideLoading();
    showToast('Gagal keluar: ' + e.message, 'error');
  }
}

// =========================================================================
// 2. DASHBOARD ADMINISTRATOR SEKOLAH (PORTAL KHUSUS PER SEKOLAH)
// =========================================================================
function renderAdminDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top App Bar Admin -->
    <header class="app-header">
      <div class="header-top">
        <div class="app-branding">
          <div class="app-logo-badge" style="background:linear-gradient(135deg, #B45309, #F59E0B);">AD</div>
          <div class="app-title-group">
            <h1>Admin Sekolah</h1>
            <div class="app-subtitle">${state.selectedSchool?.nama_sekolah || 'Portal Sekolah'}</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" id="btnToggleThemeAdmin" title="Ganti Tema">
            ${state.theme === 'dark' ? icons.sun : icons.moon}
          </button>
          <button class="btn-logout" id="btnLogoutAdmin" title="Keluar Mode Admin">
            ${icons.logOut} Keluar
          </button>
        </div>
      </div>
    </header>

    <!-- Main Admin Content -->
    <main class="tab-content" style="padding-bottom:30px;">
      <!-- Panel 1: Info Profil Sekolah -->
      <div class="settings-section">
        <div class="settings-title">
          ${icons.shieldCheck} Informasi Sekolah Aktif
        </div>
        <div class="conf-row">
          <span class="conf-label">Nama Sekolah</span>
          <span class="conf-value"><b>${state.selectedSchool?.nama_sekolah || '-'}</b></span>
        </div>
        <div class="conf-row">
          <span class="conf-label">ID Sekolah / NPSN</span>
          <span class="conf-value">${state.selectedSchoolId} / ${state.selectedSchool?.npsn || '-'}</span>
        </div>
        <div class="conf-row">
          <span class="conf-label">Alamat</span>
          <span class="conf-value">${state.selectedSchool?.alamat || '-'}</span>
        </div>
        <div class="conf-row">
          <span class="conf-label">Server Cloud</span>
          <span class="conf-value" style="color:var(--color-hadir);">Master Apps Script Aktif</span>
        </div>
      </div>

      <!-- Panel 2: Manajemen Siswa & Guru (Bebas Setting Spreadsheet) -->
      <div class="settings-section">
        <div class="settings-title">
          ${icons.users} Manajemen Data Siswa & Guru
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
          Tambah siswa dan guru langsung ke database tanpa perlu menyetting Google Sheets:
        </p>

        <div style="display:flex; gap:8px; margin-bottom:14px;">
          <button class="btn-primary" id="btnAdminOpenAddSiswa" style="flex:1; font-size:13px; padding:11px 8px; justify-content:center;">
            ${icons.plus} Tambah Siswa
          </button>
          <button class="btn-primary" id="btnAdminOpenAddGuru" style="flex:1; font-size:13px; padding:11px 8px; justify-content:center; background:linear-gradient(135deg, #059669, #10B981);">
            ${icons.plus} Tambah Guru
          </button>
        </div>

        <div class="conf-row">
          <span class="conf-label">Guru Terdaftar</span>
          <span class="conf-value">${state.guruList.length} Orang</span>
        </div>
        <div class="conf-row">
          <span class="conf-label">Daftar Kelas</span>
          <span class="conf-value">${state.kelasList.join(', ')}</span>
        </div>
        <button class="btn-secondary" id="btnAdminSyncData" style="width:100%; margin-top:10px;">
          ${icons.refresh} Sinkronkan Data dari Master Cloud
        </button>
      </div>

      <!-- Panel 3: Keamanan PIN Admin Sekolah -->
      <div class="settings-section">
        <div class="settings-title">
          ${icons.lock} Keamanan PIN Admin Sekolah
        </div>
        <div class="input-group" style="margin-bottom:10px;">
          <label for="adminInputNewPin">Ganti PIN Admin (${state.selectedSchool?.nama_sekolah})</label>
          <input type="password" class="input-control" id="adminInputNewPin" placeholder="PIN baru..." />
        </div>
        <button class="btn-secondary" id="btnAdminSavePin" style="width:100%;">
          ${icons.check} Simpan PIN Baru
        </button>
      </div>

      <!-- Panel 4: Pengaturan Master Server (Opsional / Admin Pusat) -->
      <details class="settings-section" style="cursor:pointer;">
        <summary style="font-size:12px; font-weight:700; color:var(--text-muted);">
          ⚙️ Pengaturan Master Server Endpoint (Opsional)
        </summary>
        <p style="font-size:11px; color:var(--text-dim); margin-top:8px; margin-bottom:10px;">
          URL Master Google Apps Script terpusat yang melayani semua sekolah:
        </p>
        <div class="input-group" style="margin-bottom:10px;">
          <input type="url" class="input-control" id="adminInputEndpoint" 
            placeholder="https://script.google.com/macros/s/.../exec" 
            value="${state.endpointUrl}" style="font-size:11px;" />
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-secondary" id="btnAdminSaveEndpoint" style="flex:1; font-size:11px;">
            Simpan Master URL
          </button>
          <button class="btn-secondary" id="btnAdminTestConnection" style="flex:1; font-size:11px;">
            Tes Koneksi
          </button>
        </div>
        <button class="btn-secondary" id="btnAdminAutoSetup" style="width:100%; margin-top:8px; font-size:11px;">
          Setup Master Sheets Baru (4 Tabel)
        </button>
      </details>

      <!-- Aksi Pindah ke Mode Guru -->
      <div style="text-align:center; margin-top:10px;">
        <button class="btn-secondary" id="btnAdminPreviewGuru" style="width:100%; padding:12px; font-weight:700;">
          ${icons.user} Coba Buka Tampilan Guru (${state.selectedSchool?.nama_sekolah})
        </button>
      </div>
    </main>

    <!-- Logout Modal Admin -->
    <div class="modal-overlay" id="logoutModal">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title" style="color:var(--color-alpa);">Konfirmasi Keluar</div>
        <div class="modal-desc">Apakah Anda yakin ingin keluar dari Portal Admin Sekolah?</div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-secondary" id="btnCancelLogout" style="flex:1;">Batal</button>
          <button class="btn-logout" id="btnConfirmLogout" style="flex:1; justify-content:center;">
            ${icons.logOut} Ya, Keluar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Siswa -->
    <div class="modal-overlay" id="modalAddSiswa">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
          ${icons.user} Tambah Siswa (${state.selectedSchool?.nama_sekolah})
        </div>
        <div class="modal-desc">Data siswa akan disimpan ke Sheet 'Siswa' master dan otomatis terfilter untuk sekolah ini.</div>

        <div class="input-group" style="margin-top:14px; margin-bottom:12px;">
          <label for="inputNewSiswaNama">Nama Lengkap Siswa *</label>
          <input type="text" class="input-control" id="inputNewSiswaNama" placeholder="Nama siswa..." />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div class="input-group">
            <label for="selectNewSiswaKelas">Pilih Kelas *</label>
            <select class="select-control" id="selectNewSiswaKelas">
              ${state.kelasList.map(k => `<option value="${k}">Kelas ${k}</option>`).join('')}
              <option value="__NEW__">+ Tambah Kelas Baru...</option>
            </select>
            <input type="text" class="input-control" id="inputCustomNewKelas" placeholder="Nama kelas baru..." style="display:none; margin-top:6px;" />
          </div>

          <div class="input-group">
            <label for="selectNewSiswaJk">Jenis Kelamin</label>
            <select class="select-control" id="selectNewSiswaJk">
              <option value="L">Laki-laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>
        </div>

        <div class="input-group" style="margin-bottom:18px;">
          <label for="inputNewSiswaNisn">NISN (Opsional)</label>
          <input type="text" class="input-control" id="inputNewSiswaNisn" placeholder="Nomor NISN siswa..." />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelAddSiswa" style="flex:1;">Batal</button>
          <button class="btn-primary" id="btnSubmitAddSiswa" style="flex:1;">
            ${icons.check} Simpan Siswa
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Guru (Dukungan Penuh Satminkal & Non-Satminkal) -->
    <div class="modal-overlay" id="modalAddGuru">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title" style="display:flex; align-items:center; gap:8px;">
          ${icons.user} Tambah Guru (${state.selectedSchool?.nama_sekolah})
        </div>
        <div class="modal-desc">Daftarkan guru induk (Satminkal) maupun guru tamu/honorer (Non-Satminkal).</div>

        <div class="input-group" style="margin-top:14px; margin-bottom:12px;">
          <label for="inputNewGuruNama">Nama Lengkap & Gelar Guru *</label>
          <input type="text" class="input-control" id="inputNewGuruNama" placeholder="Contoh: Dra. Siti Aminah, M.Pd" />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div class="input-group">
            <label for="inputNewGuruId">NIP / ID Guru (Unik) *</label>
            <input type="text" class="input-control" id="inputNewGuruId" placeholder="Misal: G005 atau NIP" />
          </div>

          <div class="input-group">
            <label for="selectNewGuruStatus">Status Kepegawaian *</label>
            <select class="select-control" id="selectNewGuruStatus" style="font-weight:700;">
              <option value="Satminkal">Satminkal (Induk)</option>
              <option value="Non-Satminkal">Non-Satminkal (Tamu/Honor)</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px;">
          <div class="input-group">
            <label for="inputNewGuruPin">PIN Login Guru</label>
            <input type="password" class="input-control" id="inputNewGuruPin" placeholder="Default: 1234" value="1234" maxlength="10" />
          </div>

          <div class="input-group">
            <label for="selectNewGuruWali">Wali Kelas (Opsional)</label>
            <select class="select-control" id="selectNewGuruWali">
              <option value="-">- Bukan Wali Kelas -</option>
              ${state.kelasList.map(k => `<option value="${k}">Wali Kelas ${k}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelAddGuru" style="flex:1;">Batal</button>
          <button class="btn-primary" id="btnSubmitAddGuru" style="flex:1; background:linear-gradient(135deg, #059669, #10B981);">
            ${icons.check} Simpan Guru
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container -->
    <div class="toast-container" id="toastContainer"></div>
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingText">Memproses...</div>
    </div>
  `;

  // Attach Admin Listeners
  document.getElementById('btnLogoutAdmin').addEventListener('click', handleLogout);
  document.getElementById('btnCancelLogout')?.addEventListener('click', () => closeModal('logoutModal'));
  document.getElementById('btnConfirmLogout')?.addEventListener('click', performLogout);

  document.getElementById('btnToggleThemeAdmin').addEventListener('click', async () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    await storage.setThemeMode(state.theme);
    document.getElementById('btnToggleThemeAdmin').innerHTML = state.theme === 'dark' ? icons.sun : icons.moon;
  });

  // Ganti PIN Admin Sekolah
  document.getElementById('btnAdminSavePin').addEventListener('click', async () => {
    const newPin = document.getElementById('adminInputNewPin').value.trim();
    if (!newPin || newPin.length < 4) {
      showToast('PIN baru minimal 4 karakter.', 'warning');
      return;
    }
    await storage.setAdminPin(newPin, state.selectedSchoolId);
    feedback.playSuccess();
    showToast(`PIN Admin untuk ${state.selectedSchool?.nama_sekolah} berhasil diubah!`, 'success');
    document.getElementById('adminInputNewPin').value = '';
  });

  // Simpan Master URL & Tes Koneksi (Opsional)
  document.getElementById('btnAdminSaveEndpoint')?.addEventListener('click', async () => {
    const url = document.getElementById('adminInputEndpoint').value.trim();
    await storage.setEndpointUrl(url);
    state.endpointUrl = url;
    feedback.playSuccess();
    showToast('Master Web App URL berhasil disimpan!', 'success');
  });

  document.getElementById('btnAdminTestConnection')?.addEventListener('click', async () => {
    const url = document.getElementById('adminInputEndpoint').value.trim();
    if (!url) {
      showToast('Masukkan URL Apps Script terlebih dahulu.', 'warning');
      return;
    }
    showLoading('Mengetes koneksi ke Master Google Sheets...');
    try {
      const res = await api.testConnection(url);
      feedback.playSuccess();
      showToast(`Koneksi Sukses! Terhubung ke Master: "${res.spreadsheetTitle}"`, 'success');
    } catch (err) {
      feedback.playAlert();
      showToast('Koneksi Gagal: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  document.getElementById('btnAdminAutoSetup')?.addEventListener('click', async () => {
    const url = state.endpointUrl || document.getElementById('adminInputEndpoint').value.trim();
    if (!url) {
      showToast('Masukkan URL Apps Script terlebih dahulu.', 'warning');
      return;
    }
    showLoading('Membuat 4 sheet Master Multi-Sekolah...');
    try {
      const res = await api.setupRemoteSheets(url);
      feedback.playSuccess();
      showToast(res.message || 'Master Tabel berhasil diinisialisasi!', 'success');
      await silentSyncInitData();
      renderAdminDashboard();
    } catch (err) {
      showToast('Gagal setup sheets: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Sinkronisasi Data Sekolah dari Cloud
  document.getElementById('btnAdminSyncData').addEventListener('click', async () => {
    showLoading(`Mengambil data ${state.selectedSchool?.nama_sekolah}...`);
    try {
      await silentSyncInitData();
      feedback.playSuccess();
      showToast(`Data ${state.selectedSchool?.nama_sekolah} berhasil disinkronkan!`, 'success');
      renderAdminDashboard();
    } catch (err) {
      showToast('Gagal sinkron data: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Modal Tambah Siswa
  document.getElementById('btnAdminOpenAddSiswa').addEventListener('click', () => {
    feedback.playTap();
    openModal('modalAddSiswa');
  });

  document.getElementById('btnCancelAddSiswa').addEventListener('click', () => {
    closeModal('modalAddSiswa');
  });

  const selKelas = document.getElementById('selectNewSiswaKelas');
  const inpCustomKelas = document.getElementById('inputCustomNewKelas');
  if (selKelas && inpCustomKelas) {
    selKelas.addEventListener('change', () => {
      if (selKelas.value === '__NEW__') {
        inpCustomKelas.style.display = 'block';
        inpCustomKelas.focus();
      } else {
        inpCustomKelas.style.display = 'none';
      }
    });
  }

  document.getElementById('btnSubmitAddSiswa').addEventListener('click', async () => {
    const nama = document.getElementById('inputNewSiswaNama').value.trim();
    let kelas = selKelas ? selKelas.value : '7A';
    if (kelas === '__NEW__' && inpCustomKelas) {
      kelas = inpCustomKelas.value.trim().toUpperCase();
    }
    const jk = document.getElementById('selectNewSiswaJk').value;
    const nisn = document.getElementById('inputNewSiswaNisn').value.trim();

    if (!nama) {
      showToast('Nama Siswa wajib diisi!', 'warning');
      return;
    }
    if (!kelas) {
      showToast('Kelas Siswa wajib diisi!', 'warning');
      return;
    }

    showLoading('Menyimpan siswa baru ke database...');
    try {
      const res = await api.addSiswa(state.endpointUrl, {
        id_sekolah: state.selectedSchoolId,
        nama,
        kelas,
        jenis_kelamin: jk,
        nisn: nisn || '-'
      });
      feedback.playSuccess();
      showToast(res.message || `Siswa ${nama} berhasil ditambahkan ke ${state.selectedSchool?.nama_sekolah}!`, 'success');
      closeModal('modalAddSiswa');

      if (!state.kelasList.includes(kelas)) {
        state.kelasList.push(kelas);
        state.kelasList.sort();
      }
      renderAdminDashboard();
    } catch (err) {
      showToast('Gagal menambah siswa: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Modal Tambah Guru
  document.getElementById('btnAdminOpenAddGuru').addEventListener('click', () => {
    feedback.playTap();
    openModal('modalAddGuru');
  });

  document.getElementById('btnCancelAddGuru').addEventListener('click', () => {
    closeModal('modalAddGuru');
  });

  document.getElementById('btnSubmitAddGuru').addEventListener('click', async () => {
    const nama = document.getElementById('inputNewGuruNama').value.trim();
    const id = document.getElementById('inputNewGuruId').value.trim();
    const statusGuru = document.getElementById('selectNewGuruStatus').value;
    const pin = document.getElementById('inputNewGuruPin').value.trim() || '1234';
    const wali = document.getElementById('selectNewGuruWali').value;

    if (!nama) {
      showToast('Nama Guru wajib diisi!', 'warning');
      return;
    }
    if (!id) {
      showToast('NIP / ID Guru unik wajib diisi!', 'warning');
      return;
    }

    showLoading('Menyimpan guru baru...');
    try {
      const res = await api.addGuru(state.endpointUrl, {
        id_sekolah: state.selectedSchoolId,
        nama_guru: nama,
        id_guru: id,
        pin: pin,
        wali_kelas: wali,
        status_guru: statusGuru
      });
      feedback.playSuccess();
      showToast(res.message || `Guru ${nama} [${statusGuru}] berhasil didaftarkan!`, 'success');
      closeModal('modalAddGuru');

      const existingIdx = state.guruList.findIndex(g => g.id_guru === id);
      const newGuruObj = { id_guru: id, nama_guru: nama, pin, wali_kelas: wali, status_guru: statusGuru };
      if (existingIdx >= 0) {
        state.guruList[existingIdx] = newGuruObj;
      } else {
        state.guruList.push(newGuruObj);
      }

      renderAdminDashboard();
    } catch (err) {
      showToast('Gagal menambah guru: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Preview Mode Guru
  document.getElementById('btnAdminPreviewGuru').addEventListener('click', () => {
    state.currentGuru = state.guruList[0] || { nama_guru: 'Guru Contoh', wali_kelas: '7A', status_guru: 'Satminkal' };
    state.session = {
      role: 'guru',
      guru: state.currentGuru,
      id_sekolah: state.selectedSchoolId,
      nama_sekolah: state.selectedSchool?.nama_sekolah || 'Sekolah'
    };
    renderGuruApp();
    loadSiswaForCurrentKelas();
  });
}

// =========================================================================
// 3. APLIKASI UTAMA GURU (PRESENSI, RIWAYAT, REKAP, AKUN SAYA)
// =========================================================================
function renderGuruApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top App Bar -->
    <header class="app-header">
      <div class="header-top">
        <div class="app-branding">
          <div class="app-logo-badge">PS</div>
          <div class="app-title-group">
            <h1>Presensi Siswa</h1>
            <div class="app-subtitle" id="appSubtitle">${state.selectedSchool?.nama_sekolah || 'Presensi'}</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="status-badge ${state.endpointUrl ? 'online' : 'offline'}" id="connectionBadge" title="Status Koneksi">
            ${state.endpointUrl ? icons.wifi : icons.wifiOff}
            <span id="connectionBadgeText">${state.endpointUrl ? 'Online' : 'Offline'}</span>
          </div>
          <button class="icon-btn" id="btnToggleTheme" title="Ganti Tema">
            ${state.theme === 'dark' ? icons.sun : icons.moon}
          </button>
        </div>
      </div>

      <!-- Teacher Info Strip with Logout button -->
      <div class="teacher-strip">
        <div class="teacher-info">
          <div class="teacher-avatar" id="headerTeacherAvatar">
            ${getInitials(state.currentGuru?.nama_guru || 'Guru')}
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">
              <span id="headerTeacherName">${state.currentGuru?.nama_guru || 'Guru Pengajar'}</span>
              <span class="${state.currentGuru?.status_guru === 'Non-Satminkal' ? 'badge-non-satminkal' : 'badge-satminkal'}">
                ${state.currentGuru?.status_guru || 'Satminkal'}
              </span>
            </div>
            <div style="font-size:10px; opacity:0.8;" id="headerTeacherRole">Wali: ${state.currentGuru?.wali_kelas || '-'} • ${state.selectedSchool?.nama_sekolah || ''}</div>
          </div>
        </div>
        <button class="btn-switch-guru" id="btnLogoutGuru" style="color:var(--color-alpa); display:flex; align-items:center; gap:4px;">
          ${icons.logOut} Keluar
        </button>
      </div>
    </header>

    <!-- Offline Queue Banner -->
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

        <div class="quick-actions-bar">
          <button class="btn-quick-all" id="btnSetSemuaHadir" title="Set Semua Siswa Hadir">
            ${icons.check} Set Semua Hadir
          </button>
          <div class="search-container">
            <span class="search-icon">${icons.search}</span>
            <input type="text" class="search-input" id="inputSearchSiswa" placeholder="Cari nama / NISN..." />
          </div>
        </div>

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
            <p>Pilih kelas & tanggal, lalu tekan <b>Muat Riwayat</b>.</p>
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

      <!-- 4. TAB AKUN SAYA (PROFIL GURU) -->
      <section class="tab-pane" id="tabPengaturan">
        <div class="settings-section">
          <div class="settings-title">
            ${icons.user} Profil Guru Pengajar
          </div>
          <div class="conf-row">
            <span class="conf-label">Nama Guru</span>
            <span class="conf-value">${state.currentGuru?.nama_guru || '-'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">NIP / ID Guru</span>
            <span class="conf-value">${state.currentGuru?.id_guru || '-'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Status Kepegawaian</span>
            <span class="conf-value" style="font-weight:700;">${state.currentGuru?.status_guru || 'Satminkal'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Sekolah Bertugas</span>
            <span class="conf-value">${state.selectedSchool?.nama_sekolah || '-'}</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Wali Kelas</span>
            <span class="conf-value">${state.currentGuru?.wali_kelas || 'Bukan Wali Kelas'}</span>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">
            ${icons.shieldCheck} Status Sinkronisasi
          </div>
          <div class="conf-row">
            <span class="conf-label">Server Database</span>
            <span class="conf-value" style="color:var(--color-hadir);">Master Cloud Terhubung</span>
          </div>
          <div class="conf-row">
            <span class="conf-label">Antrean Offline</span>
            <span class="conf-value">${state.offlineQueue.length} item</span>
          </div>
        </div>

        <button class="btn-logout" id="btnLogoutGuruTab" style="width:100%; padding:12px; justify-content:center; font-size:13px;">
          ${icons.logOut} Keluar dari Akun Guru
        </button>
      </section>
    </main>

    <!-- Sticky Bottom Summary Bar -->
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
        ${icons.user}
        <span>Akun</span>
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
            <span class="conf-label">Sekolah:</span>
            <span class="conf-value">${state.selectedSchool?.nama_sekolah || '-'}</span>
          </div>
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

    <!-- Logout Confirmation Modal Guru -->
    <div class="modal-overlay" id="logoutModal">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-title" style="color:var(--color-alpa);">Konfirmasi Keluar</div>
        <div class="modal-desc">Apakah Anda yakin ingin keluar dari akun guru ini? Anda harus memasukkan PIN untuk masuk kembali.</div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-secondary" id="btnCancelLogout" style="flex:1;">Batal</button>
          <button class="btn-logout" id="btnConfirmLogout" style="flex:1; justify-content:center;">
            ${icons.logOut} Ya, Keluar
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container -->
    <div class="toast-container" id="toastContainer"></div>
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingText">Memproses data...</div>
    </div>
  `;

  // Attach Guru Listeners
  attachGuruEventListeners();
}

// --- Attach Guru Listeners ---
function attachGuruEventListeners() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

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

  document.getElementById('btnSetSemuaHadir').addEventListener('click', () => {
    setSemuaHadir();
  });

  const inputSearch = document.getElementById('inputSearchSiswa');
  inputSearch.addEventListener('input', (e) => {
    state.searchQuery = (e.target.value || '').toLowerCase();
    renderStudentList();
  });

  document.getElementById('btnOpenSubmitConfirm').addEventListener('click', () => {
    openSubmitConfirmModal();
  });

  document.getElementById('btnCancelSubmit').addEventListener('click', () => {
    closeModal('confirmModal');
  });

  document.getElementById('btnConfirmAndSend').addEventListener('click', async () => {
    await sendPresensiToBackend();
  });

  document.getElementById('btnSyncOffline').addEventListener('click', async () => {
    await syncOfflineQueue();
  });

  document.getElementById('btnLoadHistory').addEventListener('click', async () => {
    await loadRiwayatData();
  });

  document.getElementById('btnLoadRekap').addEventListener('click', async () => {
    await loadRekapData();
  });

  document.getElementById('btnToggleTheme').addEventListener('click', async () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    await storage.setThemeMode(state.theme);
    document.getElementById('btnToggleTheme').innerHTML = state.theme === 'dark' ? icons.sun : icons.moon;
  });

  // Logout Buttons & Modal Actions
  document.getElementById('btnLogoutGuru').addEventListener('click', handleLogout);
  document.getElementById('btnLogoutGuruTab').addEventListener('click', handleLogout);
  document.getElementById('btnCancelLogout')?.addEventListener('click', () => closeModal('logoutModal'));
  document.getElementById('btnConfirmLogout')?.addEventListener('click', performLogout);
}

// --- Switch Tabs di Tampilan Guru ---
function switchTab(tabName) {
  state.activeTab = tabName;
  feedback.playTap();

  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const targetPane = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (targetPane) targetPane.classList.add('active');

  const stickyBar = document.getElementById('stickySummaryBar');
  if (stickyBar) {
    stickyBar.style.display = (tabName === 'presensi') ? 'flex' : 'none';
  }
}

// --- Load Siswa untuk Kelas Terpilih di Sekolah Ini ---
async function loadSiswaForCurrentKelas() {
  showLoading(`Memuat siswa kelas ${state.selectedKelas}...`);
  try {
    const list = await api.getSiswaList(state.endpointUrl, state.selectedSchoolId, state.selectedKelas);
    state.siswaList = list || [];

    // Reset status attendance map default Hadir
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

// --- Render Student List ---
function renderStudentList() {
  const container = document.getElementById('studentListContainer');
  if (!container) return;

  const filtered = state.siswaList.filter(s => {
    if (!state.searchQuery) return true;
    const nameMatch = (s.nama || '').toLowerCase().includes(state.searchQuery);
    const nisnMatch = (s.nisn || '').toLowerCase().includes(state.searchQuery);
    return nameMatch || nisnMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icons.users}</div>
        <p>Tidak ada siswa yang ditemukan untuk kelas <b>${state.selectedKelas}</b> di <b>${state.selectedSchool?.nama_sekolah}</b>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((siswa, idx) => {
    const att = state.attendanceMap[siswa.id_siswa] || { status: 'Hadir', keterangan: '' };
    const curStatus = att.status || 'Hadir';
    const hasNote = curStatus !== 'Hadir';

    return `
      <div class="student-card status-${curStatus.charAt(0).toUpperCase()}" id="card-student-${siswa.id_siswa}">
        <div class="student-main-row">
          <div class="student-number">${idx + 1}</div>
          <div class="student-info">
            <div class="student-name">${siswa.nama}</div>
            <div class="student-meta">NISN: ${siswa.nisn || '-'} • Gender: ${siswa.jenis_kelamin || 'L'}</div>
          </div>
        </div>

        <div class="attendance-options">
          <button class="status-chip chip-H ${curStatus === 'Hadir' ? 'active' : ''}" data-id="${siswa.id_siswa}" data-status="Hadir">
            ${icons.check} Hadir
          </button>
          <button class="status-chip chip-I ${curStatus === 'Izin' ? 'active' : ''}" data-id="${siswa.id_siswa}" data-status="Izin">
            Izin
          </button>
          <button class="status-chip chip-S ${curStatus === 'Sakit' ? 'active' : ''}" data-id="${siswa.id_siswa}" data-status="Sakit">
            Sakit
          </button>
          <button class="status-chip chip-A ${curStatus === 'Alpa' ? 'active' : ''}" data-id="${siswa.id_siswa}" data-status="Alpa">
            Alpa
          </button>
        </div>

        <div class="accordion-note ${hasNote ? 'visible' : ''}" id="note-box-${siswa.id_siswa}">
          <div class="note-presets">
            <span class="note-preset-pill" data-id="${siswa.id_siswa}" data-note="Sakit Demam">Demam</span>
            <span class="note-preset-pill" data-id="${siswa.id_siswa}" data-note="Acara Keluarga">Acara Keluarga</span>
            <span class="note-preset-pill" data-id="${siswa.id_siswa}" data-note="Surat Dokter">Surat Dokter</span>
            <span class="note-preset-pill" data-id="${siswa.id_siswa}" data-note="Tanpa Keterangan">Tanpa Kabar</span>
          </div>
          <input type="text" class="note-input" id="note-input-${siswa.id_siswa}" 
            placeholder="Tulis alasan izin / sakit / alpa..." 
            value="${att.keterangan || ''}" />
        </div>
      </div>
    `;
  }).join('');

  // Attach chip events
  container.querySelectorAll('.status-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const idSiswa = e.currentTarget.getAttribute('data-id');
      const status = e.currentTarget.getAttribute('data-status');
      setStatusForStudent(idSiswa, status);
    });
  });

  // Attach Note Input events
  container.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idSiswa = e.target.id.replace('note-input-', '');
      if (state.attendanceMap[idSiswa]) {
        state.attendanceMap[idSiswa].keterangan = e.target.value;
      }
    });
  });

  // Attach Preset Pills
  container.querySelectorAll('.note-preset-pill').forEach(preset => {
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

function setStatusForStudent(idSiswa, status) {
  feedback.playTap();
  if (!state.attendanceMap[idSiswa]) {
    state.attendanceMap[idSiswa] = { status: 'Hadir', keterangan: '' };
  }
  state.attendanceMap[idSiswa].status = status;

  const card = document.getElementById(`card-student-${idSiswa}`);
  if (card) {
    card.classList.remove('status-H', 'status-I', 'status-S', 'status-A');
    card.classList.add(`status-${status.charAt(0).toUpperCase()}`);

    card.querySelectorAll('.status-chip').forEach(c => {
      if (c.getAttribute('data-status') === status) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

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
  showToast('Semua siswa diatur Hadir.', 'info');
}

function updateSummaryCounters() {
  let hadir = 0, izin = 0, sakit = 0, alpa = 0;
  Object.values(state.attendanceMap).forEach(item => {
    const st = (item.status || 'Hadir').toLowerCase();
    if (st === 'hadir') hadir++;
    else if (st === 'izin') izin++;
    else if (st === 'sakit') sakit++;
    else if (st === 'alpa') alpa++;
  });

  const cHadir = document.getElementById('countHadir');
  const cIzin = document.getElementById('countIzin');
  const cSakit = document.getElementById('countSakit');
  const cAlpa = document.getElementById('countAlpa');

  if (cHadir) cHadir.textContent = hadir;
  if (cIzin) cIzin.textContent = izin;
  if (cSakit) cSakit.textContent = sakit;
  if (cAlpa) cAlpa.textContent = alpa;
}

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

// --- Kirim Presensi ke Master Google Sheets ---
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
      id_sekolah: state.selectedSchoolId,
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
      throw new Error(res.message || 'Gagal menyimpan presensi');
    }
  } catch (err) {
    feedback.playAlert();
    showToast('Gagal mengirim presensi: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Muat Riwayat Presensi ---
async function loadRiwayatData() {
  const container = document.getElementById('historyResultContainer');
  const kelas = document.getElementById('historySelectKelas').value;
  const tanggal = document.getElementById('historyInputTanggal').value;

  showLoading('Mengambil riwayat presensi...');
  try {
    const list = await api.getPresensiHistory(state.endpointUrl, state.selectedSchoolId, tanggal, kelas);

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.history}</div>
          <p>Belum ada data presensi untuk <b>Kelas ${kelas}</b> pada tanggal <b>${formatDateIndo(tanggal)}</b> di <b>${state.selectedSchool?.nama_sekolah}</b>.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="font-size:12px; font-weight:700; margin-bottom:8px; color:var(--text-muted);">
        Menampilkan ${list.length} data presensi (${formatDateIndo(tanggal)}):
      </div>
      <div class="student-list">
        ${list.map((item, idx) => `
          <div class="student-card status-${(item.status || 'H').charAt(0)}">
            <div class="student-main-row">
              <div class="student-number">${idx + 1}</div>
              <div class="student-info">
                <div class="student-name">${item.nama}</div>
                <div class="student-meta">Kelas: ${item.kelas} • Guru: ${item.nama_guru || '-'}</div>
                ${item.keterangan ? `<div style="font-size:11px; color:var(--text-dim); margin-top:2px;">Catatan: ${item.keterangan}</div>` : ''}
              </div>
              <div>
                <span class="status-chip chip-${(item.status || 'H').charAt(0)} active" style="pointer-events:none; padding:4px 8px; font-size:11px;">
                  ${item.status}
                </span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    feedback.playSuccess();
  } catch (err) {
    showToast('Gagal memuat riwayat: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Muat Rekap Data Bulanan ---
async function loadRekapData() {
  const container = document.getElementById('rekapResultContainer');
  const kelas = document.getElementById('rekapSelectKelas').value;
  const bulan = document.getElementById('rekapSelectBulan').value;

  showLoading('Menghitung rekap presensi bulanan...');
  try {
    const list = await api.getRekapData(state.endpointUrl, state.selectedSchoolId, kelas, bulan);

    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.barChart}</div>
          <p>Belum ada data rekap untuk <b>Kelas ${kelas}</b> periode <b>${bulan}</b>.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="font-size:12px; font-weight:700; margin-bottom:8px; color:var(--text-muted);">
        Rekapitulasi Kelas ${kelas} - Periode ${bulan}:
      </div>
      <div class="student-list">
        ${list.map((item, idx) => {
          const total = (item.hadir || 0) + (item.izin || 0) + (item.sakit || 0) + (item.alpa || 0);
          const persentase = total > 0 ? Math.round(((item.hadir || 0) / total) * 100) : 0;

          return `
            <div class="student-card" style="padding:12px 14px;">
              <div class="student-main-row" style="margin-bottom:8px;">
                <div class="student-number">${idx + 1}</div>
                <div class="student-info">
                  <div class="student-name">${item.nama}</div>
                  <div class="student-meta">NISN: ${item.nisn || '-'}</div>
                </div>
                <div style="text-align:right;">
                  <b style="color:${persentase >= 85 ? 'var(--color-hadir)' : (persentase >= 75 ? 'var(--color-sakit)' : 'var(--color-alpa)')}; font-size:14px;">${persentase}%</b>
                  <div style="font-size:9px; color:var(--text-dim);">Kehadiran</div>
                </div>
              </div>
              <div style="display:flex; justify-content:space-around; background:var(--input-bg); padding:6px 8px; border-radius:var(--radius-sm); font-size:11px;">
                <span style="color:var(--color-hadir);">H: <b>${item.hadir || 0}</b></span>
                <span style="color:var(--color-izin);">I: <b>${item.izin || 0}</b></span>
                <span style="color:var(--color-sakit);">S: <b>${item.sakit || 0}</b></span>
                <span style="color:var(--color-alpa);">A: <b>${item.alpa || 0}</b></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    feedback.playSuccess();
  } catch (err) {
    showToast('Gagal memuat rekap: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// --- Sinkronisasi Antrean Offline ---
async function syncOfflineQueue() {
  if (state.offlineQueue.length === 0) return;
  if (!state.endpointUrl) {
    showToast('Koneksi endpoint master belum tersedia.', 'warning');
    return;
  }

  showLoading(`Menyinkronkan ${state.offlineQueue.length} data antrean...`);
  let successCount = 0;
  const remaining = [];

  for (const item of state.offlineQueue) {
    try {
      await api.submitPresensi(state.endpointUrl, item.payload);
      successCount++;
    } catch (e) {
      remaining.push(item);
    }
  }

  state.offlineQueue = remaining;
  await storage.set(KEYS.OFFLINE_QUEUE, remaining);
  hideLoading();
  updateOfflineQueueBanner();

  if (successCount > 0) {
    feedback.playSuccess();
    showToast(`${successCount} presensi offline berhasil terkirim ke Spreadsheet!`, 'success');
  } else {
    feedback.playAlert();
    showToast('Gagal menyinkronkan data offline. Coba lagi nanti.', 'error');
  }
}

// --- Sinkronisasi Data Awal Diam-diam (Background Sync) ---
async function silentSyncInitData() {
  if (!state.endpointUrl) return;
  try {
    // Sinkronkan daftar sekolah
    const schoolRes = await api.getSchools(state.endpointUrl);
    if (schoolRes.data && schoolRes.data.length > 0) {
      state.schoolsList = schoolRes.data;
      await storage.setSchools(schoolRes.data);
    }

    // Sinkronkan data guru & kelas untuk sekolah terpilih
    const res = await api.getInitData(state.endpointUrl, state.selectedSchoolId);
    if (res.guruList && res.guruList.length > 0) {
      state.guruList = res.guruList;
      await storage.setCachedGuruList(state.selectedSchoolId, res.guruList);
    }
    if (res.kelasList && res.kelasList.length > 0) {
      state.kelasList = res.kelasList;
      await storage.setCachedKelasList(state.selectedSchoolId, res.kelasList);
    }
  } catch (e) {}
}

// --- Utilitas UI Status & Format ---
function updateNetworkStatusUI() {
  const badge = document.getElementById('connectionBadge');
  if (!badge) return;

  if (state.endpointUrl && state.isOnline) {
    badge.className = 'status-badge online';
    badge.innerHTML = `${icons.wifi} <span>Online</span>`;
  } else {
    badge.className = 'status-badge offline';
    badge.innerHTML = `${icons.wifiOff} <span>Offline</span>`;
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

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showLoading(text = 'Memproses...') {
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
    toast.style.animation = 'toastOut 0.25s forwards';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function getInitials(name) {
  if (!name) return 'GP';
  const clean = name.replace(/(Drs\.|Dr\.|H\.|Hj\.|S\.Pd|M\.Pd|S\.Kom|M\.Kom|S\.T|M\.T|,)/gi, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (y && m && d) {
    return `${parseInt(d)} ${bulan[parseInt(m) - 1]} ${y}`;
  }
  return dateStr;
}

// Jalankan Inisialisasi
window.addEventListener('DOMContentLoaded', initApp);
