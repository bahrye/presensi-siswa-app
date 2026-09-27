/**
 * Local Storage & Cache Service
 * Menggunakan @capacitor/preferences dengan fallback ke localStorage
 */
import { Preferences } from '@capacitor/preferences';

const KEYS = {
  ENDPOINT_URL: 'presensi_endpoint_url',
  ACTIVE_SESSION: 'presensi_active_session',
  ADMIN_PIN: 'presensi_admin_pin',
  CURRENT_GURU: 'presensi_current_guru',
  CACHED_GURU: 'presensi_cached_guru',
  CACHED_SISWA: 'presensi_cached_siswa',
  CACHED_KELAS: 'presensi_cached_kelas',
  OFFLINE_QUEUE: 'presensi_offline_queue',
  THEME_MODE: 'presensi_theme_mode'
};

// Data Dummy Lokal Bawaan (Agar aplikasi langsung bisa dicoba)
export const DEFAULT_SAMPLE_DATA = {
  guruList: [
    { id_guru: 'G001', nama_guru: 'Drs. Ahmad Fauzi, M.Pd', pin: '1234', wali_kelas: '7A' },
    { id_guru: 'G002', nama_guru: 'Siti Rahmawati, S.Pd', pin: '1234', wali_kelas: '7B' },
    { id_guru: 'G003', nama_guru: 'Budi Santoso, S.Kom', pin: '1234', wali_kelas: '8A' },
    { id_guru: 'G004', nama_guru: 'Nur Hidayah, S.Pd', pin: '1234', wali_kelas: '9A' }
  ],
  kelasList: ['7A', '7B', '8A', '8B', '9A'],
  siswa: {
    '7A': [
      { id_siswa: 'S001', nisn: '0081234501', nama: 'Ahmad Fajar Prasetyo', kelas: '7A', jenis_kelamin: 'L' },
      { id_siswa: 'S002', nisn: '0081234502', nama: 'Anisa Dwi Lestari', kelas: '7A', jenis_kelamin: 'P' },
      { id_siswa: 'S003', nisn: '0081234503', nama: 'Bagus Tri Wicaksono', kelas: '7A', jenis_kelamin: 'L' },
      { id_siswa: 'S004', nisn: '0081234504', nama: 'Citra Kirana Dewi', kelas: '7A', jenis_kelamin: 'P' },
      { id_siswa: 'S005', nisn: '0081234505', nama: 'Dimas Arya Pangestu', kelas: '7A', jenis_kelamin: 'L' },
      { id_siswa: 'S006', nisn: '0081234506', nama: 'Eka Putri Maharani', kelas: '7A', jenis_kelamin: 'P' },
      { id_siswa: 'S007', nisn: '0081234507', nama: 'Fathan Muhammad Alif', kelas: '7A', jenis_kelamin: 'L' },
      { id_siswa: 'S008', nisn: '0081234508', nama: 'Gita Savitri Wulandari', kelas: '7A', jenis_kelamin: 'P' },
      { id_siswa: 'S009', nisn: '0081234509', nama: 'Haikal Kurniawan', kelas: '7A', jenis_kelamin: 'L' },
      { id_siswa: 'S010', nisn: '0081234510', nama: 'Indah Permatasari', kelas: '7A', jenis_kelamin: 'P' }
    ],
    '7B': [
      { id_siswa: 'S011', nisn: '0081234511', nama: 'Bayu Pratama', kelas: '7B', jenis_kelamin: 'L' },
      { id_siswa: 'S012', nisn: '0081234512', nama: 'Cantika Aulia', kelas: '7B', jenis_kelamin: 'P' },
      { id_siswa: 'S013', nisn: '0081234513', nama: 'Deni Saputra', kelas: '7B', jenis_kelamin: 'L' },
      { id_siswa: 'S014', nisn: '0081234514', nama: 'Fatimah Zahra', kelas: '7B', jenis_kelamin: 'P' },
      { id_siswa: 'S015', nisn: '0081234515', nama: 'Gilang Ramadhan', kelas: '7B', jenis_kelamin: 'L' }
    ],
    '8A': [
      { id_siswa: 'S016', nisn: '0081234516', nama: 'Aditya Nugraha', kelas: '8A', jenis_kelamin: 'L' },
      { id_siswa: 'S017', nisn: '0081234517', nama: 'Bella Safitri', kelas: '8A', jenis_kelamin: 'P' },
      { id_siswa: 'S018', nisn: '0081234518', nama: 'Candra Wijaya', kelas: '8A', jenis_kelamin: 'L' },
      { id_siswa: 'S019', nisn: '0081234519', nama: 'Diana Puspita', kelas: '8A', jenis_kelamin: 'P' },
      { id_siswa: 'S020', nisn: '0081234520', nama: 'Eko Prasetyo', kelas: '8A', jenis_kelamin: 'L' }
    ]
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
    } catch (e) {
      // Fallback
    }
    localStorage.setItem(key, stringVal);
  }

  async remove(key) {
    try {
      await Preferences.remove({ key });
    } catch (e) {}
    localStorage.removeItem(key);
  }

  // --- Helpers Khusus Sesi & Autentikasi ---

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

  async getAdminPin() {
    return await this.get(KEYS.ADMIN_PIN, 'admin123');
  }

  async setAdminPin(pin) {
    return await this.set(KEYS.ADMIN_PIN, pin);
  }

  async getEndpointUrl() {
    return await this.get(KEYS.ENDPOINT_URL, '');
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

  async getCachedGuruList() {
    return await this.get(KEYS.CACHED_GURU, DEFAULT_SAMPLE_DATA.guruList);
  }

  async setCachedGuruList(list) {
    return await this.set(KEYS.CACHED_GURU, list);
  }

  async getCachedKelasList() {
    return await this.get(KEYS.CACHED_KELAS, DEFAULT_SAMPLE_DATA.kelasList);
  }

  async setCachedKelasList(list) {
    return await this.set(KEYS.CACHED_KELAS, list);
  }

  async getCachedSiswa(kelas) {
    const all = await this.get(KEYS.CACHED_SISWA, DEFAULT_SAMPLE_DATA.siswa);
    if (kelas && all && all[kelas]) {
      return all[kelas];
    }
    return (all && all[kelas]) || [];
  }

  async saveSiswaCache(kelas, siswaArray) {
    const all = await this.get(KEYS.CACHED_SISWA, DEFAULT_SAMPLE_DATA.siswa) || {};
    all[kelas] = siswaArray;
    await this.set(KEYS.CACHED_SISWA, all);
  }

  async addCachedSiswa(siswa) {
    const all = await this.get(KEYS.CACHED_SISWA, DEFAULT_SAMPLE_DATA.siswa) || {};
    const kelas = siswa.kelas || '7A';
    if (!all[kelas]) all[kelas] = [];
    const idx = all[kelas].findIndex(s => s.id_siswa === siswa.id_siswa || (s.nisn && s.nisn === siswa.nisn && s.nisn !== '-'));
    if (idx >= 0) {
      all[kelas][idx] = siswa;
    } else {
      all[kelas].push(siswa);
    }
    all[kelas].sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    await this.set(KEYS.CACHED_SISWA, all);
    await this.ensureKelasExists(kelas);
  }

  async addCachedGuru(guru) {
    const list = await this.getCachedGuruList();
    const idx = list.findIndex(g => g.id_guru === guru.id_guru);
    if (idx >= 0) {
      list[idx] = guru;
    } else {
      list.push(guru);
    }
    await this.setCachedGuruList(list);
    if (guru.wali_kelas && guru.wali_kelas !== '-') {
      await this.ensureKelasExists(guru.wali_kelas);
    }
  }

  async ensureKelasExists(kelas) {
    const list = await this.getCachedKelasList();
    if (!list.includes(kelas)) {
      list.push(kelas);
      list.sort();
      await this.setCachedKelasList(list);
    }
  }

  // Antrean Pengiriman Offline (Offline Sync Queue)
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

  async removeFromOfflineQueue(queueId) {
    const queue = await this.getOfflineQueue();
    const updated = queue.filter(q => q.id !== queueId);
    await this.set(KEYS.OFFLINE_QUEUE, updated);
    return updated;
  }

  async clearOfflineQueue() {
    await this.set(KEYS.OFFLINE_QUEUE, []);
  }

  async getThemeMode() {
    return await this.get(KEYS.THEME_MODE, 'light');
  }

  async setThemeMode(theme) {
    await this.set(KEYS.THEME_MODE, theme);
  }
}

export const storage = new StorageService();
