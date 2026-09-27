/**
 * Local Storage & Cache Service
 * Mendukung Sistem Master Multi-Sekolah (Multi-Tenant Centralized)
 * Menggunakan @capacitor/preferences dengan fallback ke localStorage
 */
import { Preferences } from '@capacitor/preferences';

const KEYS = {
  ENDPOINT_URL: 'presensi_endpoint_url',
  ACTIVE_SESSION: 'presensi_active_session',
  ACTIVE_SCHOOL_ID: 'presensi_active_school_id',
  CACHED_SCHOOLS: 'presensi_cached_schools',
  ADMIN_PIN: 'presensi_admin_pin',
  CURRENT_GURU: 'presensi_current_guru',
  CACHED_GURU_MAP: 'presensi_cached_guru_map',
  CACHED_SISWA_MAP: 'presensi_cached_siswa_map',
  CACHED_KELAS_MAP: 'presensi_cached_kelas_map',
  OFFLINE_QUEUE: 'presensi_offline_queue',
  THEME_MODE: 'presensi_theme_mode'
};

// URL Default Master Google Apps Script (Bisa diset sekali untuk semua sekolah)
export const DEFAULT_MASTER_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxBaYNzkYMN5J8uFRu1BTmhHYV-OHIOjBfceTGw95ohKz3Fp0fDqVeRXX7eDHGM75-usQ/exec';

// Data Contoh Multi-Sekolah (Langsung siap pakai bahkan saat offline)
export const DEFAULT_SAMPLE_SCHOOLS = [
  { id_sekolah: 'SCH01', nama_sekolah: 'SMP Negeri 1 Nusantara', npsn: '20101234', alamat: 'Jl. Merdeka No. 1, Jakarta' },
  { id_sekolah: 'SCH02', nama_sekolah: 'SMP Swasta Bhakti Utama', npsn: '20105678', alamat: 'Jl. Pemuda No. 45, Bandung' }
];

export const DEFAULT_SAMPLE_DATA = {
  schools: DEFAULT_SAMPLE_SCHOOLS,
  guruMap: {
    'SCH01': [
      { id_guru: 'G001', nama_guru: 'Drs. Ahmad Fauzi, M.Pd', pin: '1234', wali_kelas: '7A', status_guru: 'Satminkal' },
      { id_guru: 'G002', nama_guru: 'Siti Rahmawati, S.Pd', pin: '1234', wali_kelas: '7B', status_guru: 'Satminkal' },
      { id_guru: 'G003', nama_guru: 'Budi Santoso, S.Kom', pin: '1234', wali_kelas: '8A', status_guru: 'Non-Satminkal' }
    ],
    'SCH02': [
      { id_guru: 'G003', nama_guru: 'Budi Santoso, S.Kom', pin: '1234', wali_kelas: '8B', status_guru: 'Satminkal' },
      { id_guru: 'G001', nama_guru: 'Drs. Ahmad Fauzi, M.Pd', pin: '1234', wali_kelas: '-', status_guru: 'Non-Satminkal' },
      { id_guru: 'G004', nama_guru: 'Nur Hidayah, S.Pd', pin: '1234', wali_kelas: '9A', status_guru: 'Satminkal' }
    ]
  },
  kelasMap: {
    'SCH01': ['7A', '7B', '8A'],
    'SCH02': ['8B', '9A']
  },
  siswaMap: {
    'SCH01': {
      '7A': [
        { id_siswa: 'S001', nisn: '0081234501', nama: 'Ahmad Fajar Prasetyo', kelas: '7A', jenis_kelamin: 'L' },
        { id_siswa: 'S002', nisn: '0081234502', nama: 'Anisa Dwi Lestari', kelas: '7A', jenis_kelamin: 'P' },
        { id_siswa: 'S003', nisn: '0081234503', nama: 'Bagus Tri Wicaksono', kelas: '7A', jenis_kelamin: 'L' },
        { id_siswa: 'S004', nisn: '0081234504', nama: 'Citra Kirana Dewi', kelas: '7A', jenis_kelamin: 'P' },
        { id_siswa: 'S005', nisn: '0081234505', nama: 'Dimas Arya Pangestu', kelas: '7A', jenis_kelamin: 'L' }
      ],
      '7B': [
        { id_siswa: 'S011', nisn: '0081234511', nama: 'Bayu Pratama', kelas: '7B', jenis_kelamin: 'L' },
        { id_siswa: 'S012', nisn: '0081234512', nama: 'Cantika Aulia', kelas: '7B', jenis_kelamin: 'P' },
        { id_siswa: 'S013', nisn: '0081234513', nama: 'Deni Saputra', kelas: '7B', jenis_kelamin: 'L' }
      ],
      '8A': [
        { id_siswa: 'S016', nisn: '0081234516', nama: 'Aditya Nugraha', kelas: '8A', jenis_kelamin: 'L' },
        { id_siswa: 'S017', nisn: '0081234517', nama: 'Bella Safitri', kelas: '8A', jenis_kelamin: 'P' }
      ]
    },
    'SCH02': {
      '8B': [
        { id_siswa: 'SB01', nisn: '0092345601', nama: 'Andi Firmansyah', kelas: '8B', jenis_kelamin: 'L' },
        { id_siswa: 'SB02', nisn: '0092345602', nama: 'Dewi Lestari', kelas: '8B', jenis_kelamin: 'P' }
      ],
      '9A': [
        { id_siswa: 'SB03', nisn: '0092345603', nama: 'Farhan Hakim', kelas: '9A', jenis_kelamin: 'L' },
        { id_siswa: 'SB04', nisn: '0092345604', nama: 'Hesti Wulandari', kelas: '9A', jenis_kelamin: 'P' }
      ]
    }
  }
};

class StorageService {
  async get(key, defaultValue = null) {
    try {
      const res = await Preferences.get({ key });
      if (res && res.value !== null && res.value !== undefined) {
        return JSON.parse(res.value);
      }
    } catch (e) {
      const fallback = localStorage.getItem(key);
      if (fallback) {
        try { return JSON.parse(fallback); } catch (err) { return fallback; }
      }
    }
    return defaultValue;
  }

  async set(key, value) {
    const stringVal = JSON.stringify(value);
    try {
      await Preferences.set({ key, value: stringVal });
    } catch (e) { }
    localStorage.setItem(key, stringVal);
  }

  async remove(key) {
    try {
      await Preferences.remove({ key });
    } catch (e) { }
    localStorage.removeItem(key);
  }

  // --- Sesi & Autentikasi ---

  async getSession() {
    return await this.get(KEYS.ACTIVE_SESSION, null);
  }

  async setSession(sessionData) {
    return await this.set(KEYS.ACTIVE_SESSION, sessionData);
  }

  async clearSession() {
    await this.remove(KEYS.ACTIVE_SESSION);
    await this.remove(KEYS.CURRENT_GURU);
  }

  // --- Manajemen Sekolah (Multi-Tenant) ---

  async getActiveSchoolId() {
    return await this.get(KEYS.ACTIVE_SCHOOL_ID, 'SCH01');
  }

  async setActiveSchoolId(id) {
    return await this.set(KEYS.ACTIVE_SCHOOL_ID, id);
  }

  async getSchools() {
    return await this.get(KEYS.CACHED_SCHOOLS, DEFAULT_SAMPLE_SCHOOLS);
  }

  async setSchools(schoolsList) {
    return await this.set(KEYS.CACHED_SCHOOLS, schoolsList);
  }

  async addSchool(newSchool) {
    const list = await this.getSchools();
    const idx = list.findIndex(s => s.id_sekolah === newSchool.id_sekolah);
    if (idx >= 0) {
      list[idx] = newSchool;
    } else {
      list.push(newSchool);
    }
    await this.setSchools(list);
  }

  async getAdminPin(idSekolah = null) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    return await this.get(`${KEYS.ADMIN_PIN}_${targetSchool}`, 'admin123');
  }

  async setAdminPin(pin, idSekolah = null) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    return await this.set(`${KEYS.ADMIN_PIN}_${targetSchool}`, pin);
  }

  async getEndpointUrl() {
    return await this.get(KEYS.ENDPOINT_URL, DEFAULT_MASTER_ENDPOINT_URL);
  }

  async setEndpointUrl(url) {
    return await this.set(KEYS.ENDPOINT_URL, (url || '').trim());
  }

  async getCurrentGuru() {
    const session = await this.getSession();
    if (session && session.role === 'guru') {
      return session.guru;
    }
    return await this.get(KEYS.CURRENT_GURU, null);
  }

  async setCurrentGuru(guru) {
    return await this.set(KEYS.CURRENT_GURU, guru);
  }

  // --- Data Guru per Sekolah ---

  async getCachedGuruList(idSekolah = null) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    const guruMap = await this.get(KEYS.CACHED_GURU_MAP, DEFAULT_SAMPLE_DATA.guruMap) || {};
    return guruMap[targetSchool] || [];
  }

  async setCachedGuruList(idSekolah, list) {
    const guruMap = await this.get(KEYS.CACHED_GURU_MAP, DEFAULT_SAMPLE_DATA.guruMap) || {};
    guruMap[idSekolah] = list;
    return await this.set(KEYS.CACHED_GURU_MAP, guruMap);
  }

  async addCachedGuru(idSekolah, guru) {
    const list = await this.getCachedGuruList(idSekolah);
    const idx = list.findIndex(g => g.id_guru === guru.id_guru);
    if (idx >= 0) {
      list[idx] = guru;
    } else {
      list.push(guru);
    }
    await this.setCachedGuruList(idSekolah, list);
    if (guru.wali_kelas && guru.wali_kelas !== '-') {
      await this.ensureKelasExists(idSekolah, guru.wali_kelas);
    }
  }

  // --- Data Kelas per Sekolah ---

  async getCachedKelasList(idSekolah = null) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    const kelasMap = await this.get(KEYS.CACHED_KELAS_MAP, DEFAULT_SAMPLE_DATA.kelasMap) || {};
    return kelasMap[targetSchool] || ['7A', '7B', '8A'];
  }

  async setCachedKelasList(idSekolah, list) {
    const kelasMap = await this.get(KEYS.CACHED_KELAS_MAP, DEFAULT_SAMPLE_DATA.kelasMap) || {};
    kelasMap[idSekolah] = list;
    return await this.set(KEYS.CACHED_KELAS_MAP, kelasMap);
  }

  async ensureKelasExists(idSekolah, kelas) {
    const list = await this.getCachedKelasList(idSekolah);
    if (!list.includes(kelas)) {
      list.push(kelas);
      list.sort();
      await this.setCachedKelasList(idSekolah, list);
    }
  }

  // --- Data Siswa per Sekolah & Kelas ---

  async getCachedSiswa(idSekolah = null, kelas = null) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    const siswaMap = await this.get(KEYS.CACHED_SISWA_MAP, DEFAULT_SAMPLE_DATA.siswaMap) || {};
    const schoolSiswa = siswaMap[targetSchool] || {};
    if (kelas && schoolSiswa[kelas]) {
      return schoolSiswa[kelas];
    }
    return (kelas ? schoolSiswa[kelas] : schoolSiswa) || [];
  }

  async saveSiswaCache(idSekolah, kelas, siswaArray) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    const siswaMap = await this.get(KEYS.CACHED_SISWA_MAP, DEFAULT_SAMPLE_DATA.siswaMap) || {};
    if (!siswaMap[targetSchool]) siswaMap[targetSchool] = {};
    siswaMap[targetSchool][kelas] = siswaArray;
    await this.set(KEYS.CACHED_SISWA_MAP, siswaMap);
  }

  async addCachedSiswa(idSekolah, siswa) {
    const targetSchool = idSekolah || await this.getActiveSchoolId();
    const siswaMap = await this.get(KEYS.CACHED_SISWA_MAP, DEFAULT_SAMPLE_DATA.siswaMap) || {};
    if (!siswaMap[targetSchool]) siswaMap[targetSchool] = {};

    const kelas = siswa.kelas || '7A';
    if (!siswaMap[targetSchool][kelas]) siswaMap[targetSchool][kelas] = [];

    const list = siswaMap[targetSchool][kelas];
    const idx = list.findIndex(s => s.id_siswa === siswa.id_siswa || (s.nisn && s.nisn === siswa.nisn && s.nisn !== '-'));
    if (idx >= 0) {
      list[idx] = siswa;
    } else {
      list.push(siswa);
    }
    list.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    await this.set(KEYS.CACHED_SISWA_MAP, siswaMap);
    await this.ensureKelasExists(targetSchool, kelas);
  }

  // --- Antrean Pengiriman Offline (Offline Sync Queue) ---

  async getOfflineQueue() {
    return await this.get(KEYS.OFFLINE_QUEUE, []);
  }

  async addToOfflineQueue(presensiPayload) {
    const queue = await this.getOfflineQueue();
    const item = {
      id: 'OFFLINE_' + Date.now(),
      created_at: new Date().toISOString(),
      payload: presensiPayload
    };
    queue.push(item);
    await this.set(KEYS.OFFLINE_QUEUE, queue);
    return item;
  }

  async removeOfflineItem(id) {
    const queue = await this.getOfflineQueue();
    const filtered = queue.filter(item => item.id !== id);
    await this.set(KEYS.OFFLINE_QUEUE, filtered);
  }

  async clearOfflineQueue() {
    await this.set(KEYS.OFFLINE_QUEUE, []);
  }

  // --- Tema Tampilan ---

  async getThemeMode() {
    return await this.get(KEYS.THEME_MODE, 'light');
  }

  async setThemeMode(mode) {
    return await this.set(KEYS.THEME_MODE, mode);
  }
}

export const storage = new StorageService();
