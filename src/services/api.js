/**
 * API Service untuk Komunikasi dengan Google Apps Script Web App Endpoint
 */
import { storage, DEFAULT_SAMPLE_DATA } from './storage';

class ApiService {
  /**
   * Helper untuk fetch dengan timeout dan error handling
   */
  async request(url, options = {}, timeoutMs = 18000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Koneksi timeout. Pastikan jaringan internet stabil.');
      }
      throw error;
    }
  }

  /**
   * Tes Koneksi ke Google Apps Script (Ping)
   */
  async testConnection(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      throw new Error('URL Google Apps Script belum diisi.');
    }

    if (!cleanUrl.startsWith('https://script.google.com/')) {
      throw new Error('Format URL tidak valid. Harus diawali https://script.google.com/.../exec');
    }

    const testUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=ping&_t=${Date.now()}`;
    const result = await this.request(testUrl, { method: 'GET' });

    if (result && result.status === 'success') {
      return result;
    }
    throw new Error(result.message || 'Respon server tidak valid.');
  }

  /**
   * Mengambil Data Awal (Daftar Guru & Daftar Kelas)
   */
  async getInitData(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      // Kembalikan data cache lokal
      const cachedGuru = await storage.getCachedGuruList();
      const cachedKelas = await storage.getCachedKelasList();
      return {
        isOffline: true,
        guruList: cachedGuru,
        kelasList: cachedKelas
      };
    }

    try {
      const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_init_data&_t=${Date.now()}`;
      const res = await this.request(url, { method: 'GET' });

      if (res && res.status === 'success' && res.data) {
        // Simpan ke cache lokal
        if (res.data.guruList && res.data.guruList.length > 0) {
          await storage.setCachedGuruList(res.data.guruList);
        }
        if (res.data.kelasList && res.data.kelasList.length > 0) {
          await storage.setCachedKelasList(res.data.kelasList);
        }
        return {
          isOffline: false,
          guruList: res.data.guruList || [],
          kelasList: res.data.kelasList || []
        };
      }
      throw new Error(res.message || 'Gagal memuat data inisialisasi.');
    } catch (err) {
      console.warn('Gagal ambil data online, gunakan cache:', err);
      const cachedGuru = await storage.getCachedGuruList();
      const cachedKelas = await storage.getCachedKelasList();
      return {
        isOffline: true,
        error: err.message,
        guruList: cachedGuru,
        kelasList: cachedKelas
      };
    }
  }

  /**
   * Mengambil Data Siswa berdasarkan Kelas
   */
  async getSiswaList(endpointUrl, kelas) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      // Gunakan cache / default sample
      return await storage.getCachedSiswa(kelas);
    }

    try {
      const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_siswa&kelas=${encodeURIComponent(kelas)}&_t=${Date.now()}`;
      const res = await this.request(url, { method: 'GET' });

      if (res && res.status === 'success' && Array.isArray(res.data)) {
        await storage.saveSiswaCache(kelas, res.data);
        return res.data;
      }
      throw new Error(res.message || 'Format data siswa tidak valid.');
    } catch (err) {
      console.warn('Fallback ke cache lokal siswa:', err);
      return await storage.getCachedSiswa(kelas);
    }
  }

  /**
   * Mengambil Riwayat Presensi untuk Tanggal & Kelas tertentu
   */
  async getPresensiHistory(endpointUrl, tanggal, kelas) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      return [];
    }

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_presensi&tanggal=${encodeURIComponent(tanggal)}&kelas=${encodeURIComponent(kelas || '')}&_t=${Date.now()}`;
    const res = await this.request(url, { method: 'GET' });

    if (res && res.status === 'success' && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Mengambil Data Rekap Bulanan
   */
  async getRekapData(endpointUrl, kelas, bulan) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      return [];
    }

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_rekap&kelas=${encodeURIComponent(kelas || '')}&bulan=${encodeURIComponent(bulan || '')}&_t=${Date.now()}`;
    const res = await this.request(url, { method: 'GET' });

    if (res && res.status === 'success' && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Mengirim Data Presensi Massal ke Google Sheets
   * Menggunakan payload text/plain dengan stringified JSON agar kompatibel dengan CORS Google Apps Script
   */
  async submitPresensi(endpointUrl, payload) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      // Masukkan ke antrean offline jika belum setup URL
      const offlineItem = await storage.addToOfflineQueue(payload);
      return {
        status: 'offline',
        message: 'Endpoint URL belum diatur. Presensi disimpan di antrean offline lokal.',
        offlineId: offlineItem.id
      };
    }

    try {
      const bodyData = {
        action: 'save_presensi',
        ...payload
      };

      const res = await this.request(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyData)
      });

      if (res && res.status === 'success') {
        return res;
      }
      throw new Error(res.message || 'Gagal menyimpan presensi ke server.');
    } catch (err) {
      console.warn('Gagal kirim ke server online, simpan ke antrean offline:', err);
      const offlineItem = await storage.addToOfflineQueue(payload);
      return {
        status: 'offline_saved',
        message: `Koneksi gagal (${err.message}). Data berhasil disimpan di antrean offline lokal dan siap disinkronkan saat ada internet!`,
        offlineId: offlineItem.id
      };
    }
  }

  /**
   * Verifikasi Login Guru
   */
  async loginGuru(endpointUrl, namaGuru, pin) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      // Verifikasi offline dengan sample data
      const cached = await storage.getCachedGuruList();
      const found = cached.find(g => g.nama_guru.toLowerCase() === (namaGuru || '').toLowerCase());
      if (found) {
        if (!found.pin || found.pin === pin) {
          return { status: 'success', guru: found };
        }
        throw new Error('PIN / Password salah.');
      }
      throw new Error('Nama Guru tidak ditemukan dalam daftar offline.');
    }

    const bodyData = {
      action: 'login_guru',
      nama_guru: namaGuru,
      pin: pin
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyData)
    });

    if (res && res.status === 'success') {
      return res;
    }
    throw new Error(res.message || 'Gagal memverifikasi login.');
  }

  /**
   * Eksekusi Auto-Setup Sheet di Google Sheets
   */
  async setupRemoteSheets(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) throw new Error('URL belum diatur.');

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=setup_sheets&_t=${Date.now()}`;
    return await this.request(url, { method: 'GET' });
  }

  /**
   * Menambahkan Siswa Baru
   */
  async addSiswa(endpointUrl, siswaData) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      await storage.addCachedSiswa(siswaData);
      return {
        status: 'success',
        isOffline: true,
        message: 'Siswa berhasil disimpan ke penyimpanan lokal.',
        data: siswaData
      };
    }

    const payload = {
      action: 'add_siswa',
      ...siswaData
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      await storage.addCachedSiswa(res.data || siswaData);
      return res;
    }
    throw new Error(res.message || 'Gagal menambahkan siswa.');
  }

  /**
   * Menambahkan Guru Baru
   */
  async addGuru(endpointUrl, guruData) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      await storage.addCachedGuru(guruData);
      return {
        status: 'success',
        isOffline: true,
        message: 'Guru berhasil disimpan ke penyimpanan lokal.',
        data: guruData
      };
    }

    const payload = {
      action: 'add_guru',
      ...guruData
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      await storage.addCachedGuru(res.data || guruData);
      return res;
    }
    throw new Error(res.message || 'Gagal menambahkan guru.');
  }
}

export const api = new ApiService();
