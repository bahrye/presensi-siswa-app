/**
 * API Service untuk Komunikasi dengan Google Apps Script Master Endpoint
 * Mendukung Multi-Tenant / Multi-Sekolah
 */
import { storage } from './storage';

class ApiService {
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
        throw new Error('Koneksi timeout. Pastikan koneksi internet stabil.');
      }
      throw error;
    }
  }

  /**
   * Tes Koneksi ke Master Google Apps Script (Ping)
   */
  async testConnection(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      throw new Error('URL Google Apps Script belum diatur.');
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
   * Mengambil Daftar Sekolah Terdaftar
   */
  async getSchools(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      const local = await storage.getSchools();
      return { isOffline: true, data: local };
    }

    try {
      const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_schools&_t=${Date.now()}`;
      const res = await this.request(url, { method: 'GET' });
      if (res && res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
        await storage.setSchools(res.data);
        return { isOffline: false, data: res.data };
      }
      const local = await storage.getSchools();
      return { isOffline: false, data: local };
    } catch (e) {
      const local = await storage.getSchools();
      return { isOffline: true, data: local };
    }
  }

  /**
   * Mendaftarkan Sekolah Baru
   */
  async registerSchool(endpointUrl, schoolData) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      const newSchool = {
        id_sekolah: 'SCH_' + Date.now().toString().slice(-4),
        nama_sekolah: schoolData.nama_sekolah,
        npsn: schoolData.npsn || '-',
        alamat: schoolData.alamat || '-'
      };
      await storage.addSchool(newSchool);
      return {
        status: 'success',
        isOffline: true,
        message: `Sekolah ${newSchool.nama_sekolah} berhasil didaftarkan di lokal (Mode Offline)!`,
        data: newSchool
      };
    }

    const payload = {
      action: 'register_school',
      ...schoolData
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      if (res.data) await storage.addSchool(res.data);
      return res;
    }
    throw new Error(res.message || 'Gagal mendaftarkan sekolah.');
  }

  /**
   * Verifikasi Login Admin Sekolah
   */
  async verifyAdminLogin(endpointUrl, idSekolah, pin) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      const savedPin = await storage.getAdminPin(idSekolah);
      if (pin === savedPin || pin === 'admin123') {
        const schools = await storage.getSchools();
        const found = schools.find(s => s.id_sekolah === idSekolah) || { id_sekolah: idSekolah, nama_sekolah: 'Sekolah' };
        return { status: 'success', sekolah: found };
      }
      throw new Error('PIN Admin Sekolah salah! (Default: admin123)');
    }

    const payload = {
      action: 'admin_login',
      id_sekolah: idSekolah,
      pin_admin: pin
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      return res;
    }
    throw new Error(res.message || 'PIN Admin Sekolah salah.');
  }

  /**
   * Mengambil Data Awal Sekolah (Guru & Kelas berdasarkan ID_Sekolah)
   */
  async getInitData(endpointUrl, idSekolah) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      const cachedGuru = await storage.getCachedGuruList(idSekolah);
      const cachedKelas = await storage.getCachedKelasList(idSekolah);
      return {
        isOffline: true,
        guruList: cachedGuru,
        kelasList: cachedKelas
      };
    }

    try {
      const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_init_data&id_sekolah=${encodeURIComponent(idSekolah)}&_t=${Date.now()}`;
      const res = await this.request(url, { method: 'GET' });

      if (res && res.status === 'success' && res.data) {
        if (res.data.guruList) {
          await storage.setCachedGuruList(idSekolah, res.data.guruList);
        }
        if (res.data.kelasList) {
          await storage.setCachedKelasList(idSekolah, res.data.kelasList);
        }
        return {
          isOffline: false,
          guruList: res.data.guruList || [],
          kelasList: res.data.kelasList || []
        };
      }
      throw new Error(res.message || 'Gagal memuat data inisialisasi.');
    } catch (err) {
      const cachedGuru = await storage.getCachedGuruList(idSekolah);
      const cachedKelas = await storage.getCachedKelasList(idSekolah);
      return {
        isOffline: true,
        error: err.message,
        guruList: cachedGuru,
        kelasList: cachedKelas
      };
    }
  }

  /**
   * Mengambil Data Siswa berdasarkan ID_Sekolah dan Kelas
   */
  async getSiswaList(endpointUrl, idSekolah, kelas) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      return await storage.getCachedSiswa(idSekolah, kelas);
    }

    try {
      const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_siswa&id_sekolah=${encodeURIComponent(idSekolah)}&kelas=${encodeURIComponent(kelas)}&_t=${Date.now()}`;
      const res = await this.request(url, { method: 'GET' });

      if (res && res.status === 'success' && Array.isArray(res.data)) {
        await storage.saveSiswaCache(idSekolah, kelas, res.data);
        return res.data;
      }
      throw new Error(res.message || 'Format data siswa tidak valid.');
    } catch (err) {
      return await storage.getCachedSiswa(idSekolah, kelas);
    }
  }

  /**
   * Mengambil Riwayat Presensi
   */
  async getPresensiHistory(endpointUrl, idSekolah, tanggal, kelas) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) return [];

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_presensi&id_sekolah=${encodeURIComponent(idSekolah)}&tanggal=${encodeURIComponent(tanggal)}&kelas=${encodeURIComponent(kelas || '')}&_t=${Date.now()}`;
    const res = await this.request(url, { method: 'GET' });

    if (res && res.status === 'success' && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Mengambil Data Rekap Bulanan
   */
  async getRekapData(endpointUrl, idSekolah, kelas, bulan) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) return [];

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_rekap&id_sekolah=${encodeURIComponent(idSekolah)}&kelas=${encodeURIComponent(kelas || '')}&bulan=${encodeURIComponent(bulan || '')}&_t=${Date.now()}`;
    const res = await this.request(url, { method: 'GET' });

    if (res && res.status === 'success' && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Mengirim Data Presensi Massal ke Google Sheets Master
   */
  async submitPresensi(endpointUrl, payload) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) {
      const offlineItem = await storage.addToOfflineQueue(payload);
      return {
        status: 'offline',
        message: 'Aplikasi dalam mode offline lokal. Presensi disimpan di antrean offline.',
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
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(bodyData)
      });

      if (res && res.status === 'success') {
        return res;
      }
      throw new Error(res.message || 'Gagal menyimpan presensi ke server.');
    } catch (err) {
      const offlineItem = await storage.addToOfflineQueue(payload);
      return {
        status: 'offline_saved',
        message: `Koneksi internet bermasalah (${err.message}). Data berhasil disimpan di antrean offline lokal dan siap disinkronkan saat online!`,
        offlineId: offlineItem.id
      };
    }
  }

  /**
   * Menambahkan Siswa Baru
   */
  async addSiswa(endpointUrl, siswaData) {
    const cleanUrl = (endpointUrl || '').trim();
    const idSekolah = siswaData.id_sekolah || await storage.getActiveSchoolId();

    if (!cleanUrl) {
      await storage.addCachedSiswa(idSekolah, siswaData);
      return {
        status: 'success',
        isOffline: true,
        message: 'Siswa berhasil disimpan ke penyimpanan lokal.',
        data: siswaData
      };
    }

    const payload = {
      action: 'add_siswa',
      ...siswaData,
      id_sekolah: idSekolah
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      await storage.addCachedSiswa(idSekolah, res.data || siswaData);
      return res;
    }
    throw new Error(res.message || 'Gagal menambahkan siswa.');
  }

  /**
   * Menambahkan Guru Baru
   */
  async addGuru(endpointUrl, guruData) {
    const cleanUrl = (endpointUrl || '').trim();
    const idSekolah = guruData.id_sekolah || await storage.getActiveSchoolId();

    if (!cleanUrl) {
      await storage.addCachedGuru(idSekolah, guruData);
      return {
        status: 'success',
        isOffline: true,
        message: 'Guru berhasil disimpan ke penyimpanan lokal.',
        data: guruData
      };
    }

    const payload = {
      action: 'add_guru',
      ...guruData,
      id_sekolah: idSekolah
    };

    const res = await this.request(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      await storage.addCachedGuru(idSekolah, res.data || guruData);
      return res;
    }
    throw new Error(res.message || 'Gagal menambahkan guru.');
  }

  /**
   * Auto Setup Master Sheets
   */
  async setupRemoteSheets(endpointUrl) {
    const cleanUrl = (endpointUrl || '').trim();
    if (!cleanUrl) throw new Error('URL belum diatur.');

    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=setup_sheets&_t=${Date.now()}`;
    return await this.request(url, { method: 'GET' });
  }
}

export const api = new ApiService();
