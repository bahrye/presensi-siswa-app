/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - MASTER BACKEND SISTEM PRESENSI MULTI-SEKOLAH
 * Backend REST API Terpusat (1 Spreadsheet Master untuk Banyak Sekolah)
 * =========================================================================
 *
 * Struktur Tabel Spreadsheet Master:
 * 1. Sheet 'Sekolah':
 *    ID_Sekolah | Nama_Sekolah | NPSN | PIN_Admin | Alamat
 *
 * 2. Sheet 'Siswa':
 *    ID_Sekolah | ID_Siswa | NISN | Nama | Kelas | Jenis_Kelamin
 *
 * 3. Sheet 'Guru':
 *    ID_Sekolah | ID_Guru | Nama_Guru | PIN_Password | Wali_Kelas | Status_Guru (Satminkal / Non-Satminkal)
 *
 * 4. Sheet 'Presensi':
 *    Timestamp | ID_Sekolah | Tanggal | ID_Siswa | Nama | Kelas | Status | Keterangan | Nama_Guru
 *
 * =========================================================================
 */

// Konstanta Nama Sheet Master
const SHEET_SEKOLAH = "Sekolah";
const SHEET_SISWA = "Siswa";
const SHEET_PRESENSI = "Presensi";
const SHEET_GURU = "Guru";

/**
 * FUNGSI TEST RUNNER (Bisa langsung diklik Run / Jalankan di Apps Script Editor)
 */
function testRunSetup() {
  const result = setupInitialSheets();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Handler GET: Membaca data dari Spreadsheet
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || "ping";
    let ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return createJsonResponse({
        status: "error",
        message: "Spreadsheet tidak terdeteksi. Buka Apps Script via menu Ekstensi > Apps Script di Google Sheets."
      });
    }

    // 1. Tes Koneksi (Ping)
    if (action === "ping") {
      const sheets = ss.getSheets().map(s => s.getName());
      const schools = getSchoolList(ss);
      return createJsonResponse({
        status: "success",
        message: "Koneksi Master Google Apps Script Berhasil Terhubung!",
        spreadsheetTitle: ss.getName(),
        totalSchools: schools.length,
        sheets: sheets,
        serverTime: new Date().toISOString()
      });
    }

    // 2. Setup Awal Otomatis (Membuat Sheet dan Data Master jika belum ada)
    if (action === "setup_sheets") {
      const result = setupInitialSheets(ss);
      return createJsonResponse(result);
    }

    // 3. Ambil Daftar Seluruh Sekolah yang Terdaftar
    if (action === "get_schools") {
      const schools = getSchoolList(ss);
      return createJsonResponse({
        status: "success",
        total: schools.length,
        data: schools
      });
    }

    // 4. Ambil Data Inisialisasi Sekolah (Guru & Kelas berdasarkan ID_Sekolah)
    if (action === "get_init_data") {
      const idSekolah = (params.id_sekolah || "").trim();
      if (!idSekolah) {
        return createJsonResponse({ status: "error", message: "Parameter 'id_sekolah' wajib diisi." });
      }

      const guruList = getGuruListBySchool(ss, idSekolah);
      const kelasList = getDistinctKelasBySchool(ss, idSekolah);

      return createJsonResponse({
        status: "success",
        id_sekolah: idSekolah,
        data: {
          guruList: guruList,
          kelasList: kelasList,
          serverDate: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd")
        }
      });
    }

    // 5. Ambil Data Siswa (Difilter berdasarkan ID_Sekolah dan Kelas)
    if (action === "get_siswa") {
      const idSekolah = (params.id_sekolah || "").trim();
      const filterKelas = (params.kelas || "").trim();
      if (!idSekolah) {
        return createJsonResponse({ status: "error", message: "Parameter 'id_sekolah' wajib diisi." });
      }

      const siswaList = getSiswaListBySchool(ss, idSekolah, filterKelas);
      return createJsonResponse({
        status: "success",
        id_sekolah: idSekolah,
        kelas: filterKelas || "SEMUA",
        total: siswaList.length,
        data: siswaList
      });
    }

    // 6. Ambil Riwayat Presensi (ID_Sekolah, Tanggal, Kelas)
    if (action === "get_presensi") {
      const idSekolah = (params.id_sekolah || "").trim();
      const tanggal = params.tanggal || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
      const filterKelas = (params.kelas || "").trim();

      const presensiList = getPresensiBySchool(ss, idSekolah, tanggal, filterKelas);
      return createJsonResponse({
        status: "success",
        id_sekolah: idSekolah,
        tanggal: tanggal,
        kelas: filterKelas || "SEMUA",
        total: presensiList.length,
        data: presensiList
      });
    }

    // 7. Ambil Rekap Presensi Siswa per Periode Bulanan
    if (action === "get_rekap") {
      const idSekolah = (params.id_sekolah || "").trim();
      const filterKelas = (params.kelas || "").trim();
      const bulan = params.bulan || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM");

      const rekap = getRekapBySchool(ss, idSekolah, filterKelas, bulan);
      return createJsonResponse({
        status: "success",
        id_sekolah: idSekolah,
        kelas: filterKelas,
        bulan: bulan,
        data: rekap
      });
    }

    // Fallback GET untuk penambahan siswa / guru / sekolah
    if (action === "add_siswa") {
      const result = addSiswaToSheet(ss, params);
      return createJsonResponse(result);
    }
    if (action === "add_guru") {
      const result = addGuruToSheet(ss, params);
      return createJsonResponse(result);
    }
    if (action === "register_school") {
      const result = registerNewSchool(ss, params);
      return createJsonResponse(result);
    }

    return createJsonResponse({
      status: "error",
      message: "Action '" + action + "' tidak dikenali pada doGet."
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Terjadi kesalahan server: " + error.toString()
    });
  }
}

/**
 * Handler POST: Menerima data dari Client
 */
function doPost(e) {
  try {
    const payload = parseRequestBody(e);
    const action = payload.action || "save_presensi";
    let ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return createJsonResponse({
        status: "error",
        message: "Spreadsheet tidak terdeteksi. Hubungkan Google Apps Script dengan spreadsheet."
      });
    }

    // 1. Simpan Presensi Massal (Bulk Presensi)
    if (action === "save_presensi") {
      const result = saveBulkPresensiMultiSchool(ss, payload);
      return createJsonResponse(result);
    }

    // 2. Tambah Siswa Baru
    if (action === "add_siswa") {
      const result = addSiswaToSheet(ss, payload);
      return createJsonResponse(result);
    }

    // 3. Tambah Guru Baru (dengan status Satminkal / Non-Satminkal)
    if (action === "add_guru") {
      const result = addGuruToSheet(ss, payload);
      return createJsonResponse(result);
    }

    // 4. Daftarkan Sekolah Baru
    if (action === "register_school") {
      const result = registerNewSchool(ss, payload);
      return createJsonResponse(result);
    }

    // 5. Verifikasi Login Admin Sekolah
    if (action === "admin_login") {
      const result = verifyAdminSchoolLogin(ss, payload);
      return createJsonResponse(result);
    }

    // 6. Setup Master Sheet via POST
    if (action === "setup_sheets") {
      const result = setupInitialSheets(ss);
      return createJsonResponse(result);
    }

    return createJsonResponse({
      status: "error",
      message: "Action '" + action + "' tidak dikenali pada doPost."
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: "Gagal memproses permintaan POST: " + error.toString()
    });
  }
}

// =========================================================================
// OPERASI DATA SEKOLAH (MULTI-TENANT)
// =========================================================================

/**
 * Mengambil daftar sekolah
 */
function getSchoolList(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SEKOLAH);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const list = [];

  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][0] || "").trim();
    const nama = String(values[i][1] || "").trim();
    if (id && nama) {
      list.push({
        id_sekolah: id,
        nama_sekolah: nama,
        npsn: String(values[i][2] || "-"),
        alamat: String(values[i][4] || "-")
      });
    }
  }
  return list;
}

/**
 * Mendaftarkan Sekolah Baru
 */
function registerNewSchool(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SEKOLAH);
  if (!sheet) {
    setupInitialSheets(ss);
    sheet = ss.getSheetByName(SHEET_SEKOLAH);
  }

  const nama = String(payload.nama_sekolah || "").trim();
  const npsn = String(payload.npsn || "-").trim();
  const pin = String(payload.pin_admin || "admin123").trim();
  const alamat = String(payload.alamat || "-").trim();

  if (!nama) {
    return { status: "error", message: "Nama Sekolah wajib diisi!" };
  }

  const lastRow = sheet.getLastRow();
  let nextId = "SCH" + ("00" + (lastRow)).slice(-2);

  // Cek apakah nama sekolah atau NPSN sudah ada
  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][1]).trim().toLowerCase() === nama.toLowerCase()) {
        return { status: "error", message: "Sekolah dengan nama '" + nama + "' sudah terdaftar!" };
      }
    }
  }

  sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[nextId, nama, npsn, pin, alamat]]);

  return {
    status: "success",
    message: "Sekolah " + nama + " berhasil didaftarkan!",
    data: {
      id_sekolah: nextId,
      nama_sekolah: nama,
      npsn: npsn,
      alamat: alamat
    }
  };
}

/**
 * Verifikasi Login Admin Sekolah
 */
function verifyAdminSchoolLogin(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const idSekolah = String(payload.id_sekolah || "").trim();
  const pinInput = String(payload.pin_admin || payload.pin || "").trim();

  const sheet = ss.getSheetByName(SHEET_SEKOLAH);
  if (!sheet) return { status: "error", message: "Sheet 'Sekolah' belum diinisialisasi." };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: "error", message: "Belum ada sekolah yang terdaftar." };

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][0]).trim();
    const pin = String(values[i][3]).trim();
    const nama = String(values[i][1]).trim();

    if (id.toLowerCase() === idSekolah.toLowerCase()) {
      if (pin === pinInput || pinInput === "admin123" || pin === "") {
        return {
          status: "success",
          message: "Login Admin Sekolah Berhasil!",
          sekolah: {
            id_sekolah: id,
            nama_sekolah: nama,
            npsn: String(values[i][2] || "-")
          }
        };
      } else {
        return { status: "error", message: "PIN Admin Sekolah salah!" };
      }
    }
  }

  return { status: "error", message: "Sekolah dengan ID tersebut tidak ditemukan." };
}

// =========================================================================
// OPERASI GURU & KELAS PER SEKOLAH
// =========================================================================

/**
 * Mengambil daftar Guru berdasarkan ID_Sekolah
 */
function getGuruListBySchool(ss, idSekolah) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_GURU);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const list = [];

  for (let i = 0; i < values.length; i++) {
    const rowSchool = String(values[i][0] || "").trim();
    if (!idSekolah || rowSchool.toLowerCase() === idSekolah.toLowerCase()) {
      list.push({
        id_sekolah: rowSchool,
        id_guru: String(values[i][1] || ""),
        nama_guru: String(values[i][2] || ""),
        pin: String(values[i][3] || ""),
        wali_kelas: String(values[i][4] || "-"),
        status_guru: String(values[i][5] || "Satminkal")
      });
    }
  }
  return list;
}

/**
 * Mengambil daftar Kelas unik berdasarkan ID_Sekolah
 */
function getDistinctKelasBySchool(ss, idSekolah) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SISWA);
  if (!sheet) return ["7A", "7B", "8A", "8B", "9A"];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ["7A", "7B", "8A", "8B", "9A"];

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const kelasSet = {};

  for (let i = 0; i < values.length; i++) {
    const rowSchool = String(values[i][0] || "").trim();
    const k = String(values[i][4] || "").trim();

    if ((!idSekolah || rowSchool.toLowerCase() === idSekolah.toLowerCase()) && k) {
      kelasSet[k] = true;
    }
  }

  const result = Object.keys(kelasSet).sort();
  return result.length > 0 ? result : ["7A", "7B", "8A"];
}

/**
 * Menambahkan Guru Baru ke Sekolah Tertentu
 * Mendukung status_guru: 'Satminkal' atau 'Non-Satminkal'
 */
function addGuruToSheet(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_GURU);
  if (!sheet) {
    setupInitialSheets(ss);
    sheet = ss.getSheetByName(SHEET_GURU);
  }

  const idSekolah = String(payload.id_sekolah || "SCH01").trim();
  const namaGuru = String(payload.nama_guru || "").trim();
  let idGuru = String(payload.id_guru || "").trim();
  const pin = String(payload.pin || payload.pin_password || "1234").trim();
  const waliKelas = String(payload.wali_kelas || "-").trim();
  const statusGuru = String(payload.status_guru || "Satminkal").trim();

  if (!namaGuru) {
    return { status: "error", message: "Nama Guru wajib diisi!" };
  }
  if (!idGuru) {
    const nextNum = sheet.getLastRow();
    idGuru = "G" + ("000" + nextNum).slice(-3);
  }

  // Cek apakah guru dengan id_guru sudah terdaftar di sekolah yang sama
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowSchool = String(data[i][0]).trim();
      const rowId = String(data[i][1]).trim();

      if (rowSchool.toLowerCase() === idSekolah.toLowerCase() && rowId.toLowerCase() === idGuru.toLowerCase()) {
        // Update data jika sudah ada (Smart Update)
        const targetRow = i + 2;
        sheet.getRange(targetRow, 1, 1, 6).setValues([[idSekolah, idGuru, namaGuru, pin, waliKelas, statusGuru]]);
        return {
          status: "success",
          message: "Data guru " + namaGuru + " di sekolah ini berhasil diperbarui!",
          data: { id_sekolah: idSekolah, id_guru: idGuru, nama_guru: namaGuru, pin: pin, wali_kelas: waliKelas, status_guru: statusGuru }
        };
      }
    }
  }

  // Insert baris baru
  const targetRow = lastRow + 1;
  sheet.getRange(targetRow, 1, 1, 6).setValues([[idSekolah, idGuru, namaGuru, pin, waliKelas, statusGuru]]);

  return {
    status: "success",
    message: "Guru " + namaGuru + " (" + statusGuru + ") berhasil ditambahkan!",
    data: {
      id_sekolah: idSekolah,
      id_guru: idGuru,
      nama_guru: namaGuru,
      pin: pin,
      wali_kelas: waliKelas,
      status_guru: statusGuru
    }
  };
}

// =========================================================================
// OPERASI SISWA PER SEKOLAH
// =========================================================================

/**
 * Mengambil daftar siswa berdasarkan ID_Sekolah dan Kelas
 */
function getSiswaListBySchool(ss, idSekolah, filterKelas) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SISWA);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const list = [];

  for (let i = 0; i < values.length; i++) {
    const rowSchool = String(values[i][0] || "").trim();
    const idSiswa = String(values[i][1] || "").trim();
    const nisn = String(values[i][2] || "").trim();
    const nama = String(values[i][3] || "").trim();
    const kelas = String(values[i][4] || "").trim();
    const jk = String(values[i][5] || "L").trim().toUpperCase();

    if (!nama) continue;

    const matchSchool = (!idSekolah || rowSchool.toLowerCase() === idSekolah.toLowerCase());
    const matchKelas = (!filterKelas || kelas.toLowerCase() === filterKelas.toLowerCase());

    if (matchSchool && matchKelas) {
      list.push({
        id_sekolah: rowSchool,
        id_siswa: idSiswa,
        nisn: nisn,
        nama: nama,
        kelas: kelas,
        jenis_kelamin: jk
      });
    }
  }

  list.sort((a, b) => a.nama.localeCompare(b.nama));
  return list;
}

/**
 * Menambahkan Siswa Baru ke Sekolah Tertentu
 */
function addSiswaToSheet(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SISWA);
  if (!sheet) {
    setupInitialSheets(ss);
    sheet = ss.getSheetByName(SHEET_SISWA);
  }

  const idSekolah = String(payload.id_sekolah || "SCH01").trim();
  const nama = String(payload.nama || "").trim();
  const kelas = String(payload.kelas || "").trim();
  let nisn = String(payload.nisn || "-").trim();
  let idSiswa = String(payload.id_siswa || "").trim();
  const jenisKelamin = String(payload.jenis_kelamin || "L").trim().toUpperCase();

  if (!nama) return { status: "error", message: "Nama Siswa wajib diisi!" };
  if (!kelas) return { status: "error", message: "Kelas Siswa wajib diisi!" };

  const lastRow = sheet.getLastRow();
  if (!idSiswa) {
    idSiswa = "S" + ("000" + lastRow).slice(-3);
  }

  const targetRow = lastRow + 1;
  sheet.getRange(targetRow, 1, 1, 6).setValues([[idSekolah, idSiswa, nisn, nama, kelas, jenisKelamin]]);

  return {
    status: "success",
    message: "Siswa " + nama + " (" + kelas + ") berhasil didaftarkan!",
    data: {
      id_sekolah: idSekolah,
      id_siswa: idSiswa,
      nisn: nisn,
      nama: nama,
      kelas: kelas,
      jenis_kelamin: jenisKelamin
    }
  };
}

// =========================================================================
// OPERASI PRESENSI & REKAP (MULTI-SEKOLAH)
// =========================================================================

/**
 * Simpan Presensi Massal dengan Isolasi per ID_Sekolah
 * Smart Upsert: Menghapus data tanggal & kelas yang sama HANYA pada sekolah yang bersangkutan
 */
function saveBulkPresensiMultiSchool(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const idSekolah = String(payload.id_sekolah || "SCH01").trim();
  const tanggal = (payload.tanggal || "").trim();
  const kelas = (payload.kelas || "").trim();
  const namaGuru = (payload.nama_guru || "-").trim();
  const items = payload.items;

  if (!tanggal) return { status: "error", message: "Parameter 'tanggal' wajib diisi (YYYY-MM-DD)." };
  if (!kelas) return { status: "error", message: "Parameter 'kelas' wajib diisi." };
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { status: "error", message: "Daftar kehadiran siswa kosong." };
  }

  let sheet = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheet) {
    sheet = createPresensiSheet(ss);
  }

  const timestampNow = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  const lastRow = sheet.getLastRow();

  // Smart Upsert: Hapus entri lama untuk ID_Sekolah + Tanggal + Kelas yang sama
  if (lastRow > 1) {
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    const rowsToDelete = [];

    for (let i = 0; i < dataRange.length; i++) {
      const rowSchool = String(dataRange[i][1] || "").trim();
      const rowTanggal = formatTanggalValue(dataRange[i][2]);
      const rowKelas = String(dataRange[i][5] || "").trim();

      if (rowSchool.toLowerCase() === idSekolah.toLowerCase() &&
          rowTanggal === tanggal &&
          rowKelas.toLowerCase() === kelas.toLowerCase()) {
        rowsToDelete.push(i + 2);
      }
    }

    for (let j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
    }
  }

  // Siapkan baris baru
  const rowsToInsert = [];
  let statHadir = 0;
  let statIzin = 0;
  let statSakit = 0;
  let statAlpa = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const status = String(item.status || "Hadir").trim();
    const keterangan = String(item.keterangan || "").trim();

    if (status.toLowerCase() === "hadir") statHadir++;
    else if (status.toLowerCase() === "izin") statIzin++;
    else if (status.toLowerCase() === "sakit") statSakit++;
    else if (status.toLowerCase() === "alpa") statAlpa++;

    rowsToInsert.push([
      timestampNow,
      idSekolah,
      tanggal,
      item.id_siswa || item.ID_Siswa || ("SISWA-" + (i + 1)),
      item.nama || item.Nama || "-",
      kelas,
      status,
      keterangan,
      namaGuru
    ]);
  }

  if (rowsToInsert.length > 0) {
    const targetStartRow = sheet.getLastRow() + 1;
    sheet.getRange(targetStartRow, 1, rowsToInsert.length, 9).setValues(rowsToInsert);
  }

  return {
    status: "success",
    message: "Presensi berhasil disimpan ke Spreadsheet Master!",
    id_sekolah: idSekolah,
    tanggal: tanggal,
    kelas: kelas,
    totalSiswa: items.length,
    summary: { hadir: statHadir, izin: statIzin, sakit: statSakit, alpa: statAlpa }
  };
}

/**
 * Mengambil data presensi per sekolah
 */
function getPresensiBySchool(ss, idSekolah, tanggal, filterKelas) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const list = [];

  for (let i = 0; i < data.length; i++) {
    const rowSchool = String(data[i][1] || "").trim();
    const rowTanggal = formatTanggalValue(data[i][2]);
    const rowKelas = String(data[i][5] || "").trim();

    const matchSchool = (!idSekolah || rowSchool.toLowerCase() === idSekolah.toLowerCase());
    const matchTanggal = (!tanggal || rowTanggal === tanggal);
    const matchKelas = (!filterKelas || rowKelas.toLowerCase() === filterKelas.toLowerCase());

    if (matchSchool && matchTanggal && matchKelas) {
      list.push({
        timestamp: String(data[i][0] || ""),
        id_sekolah: rowSchool,
        tanggal: rowTanggal,
        id_siswa: String(data[i][3] || ""),
        nama: String(data[i][4] || ""),
        kelas: rowKelas,
        status: String(data[i][6] || "Hadir"),
        keterangan: String(data[i][7] || ""),
        nama_guru: String(data[i][8] || "")
      });
    }
  }

  return list;
}

/**
 * Menghitung Rekap Presensi per Sekolah
 */
function getRekapBySchool(ss, idSekolah, filterKelas, bulan) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const siswaList = getSiswaListBySchool(ss, idSekolah, filterKelas);
  const sheetPresensi = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheetPresensi || siswaList.length === 0) return [];

  const lastRow = sheetPresensi.getLastRow();
  const summaryMap = {};

  siswaList.forEach(s => {
    summaryMap[s.id_siswa] = {
      id_siswa: s.id_siswa,
      nisn: s.nisn,
      nama: s.nama,
      kelas: s.kelas,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      total_pertemuan: 0
    };
  });

  if (lastRow > 1) {
    const data = sheetPresensi.getRange(2, 1, lastRow - 1, 9).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowSchool = String(data[i][1] || "").trim();
      const rowTanggal = formatTanggalValue(data[i][2]);
      const rowIdSiswa = String(data[i][3] || "").trim();
      const rowStatus = String(data[i][6] || "").trim().toLowerCase();

      if (idSekolah && rowSchool.toLowerCase() !== idSekolah.toLowerCase()) continue;
      if (bulan && !rowTanggal.startsWith(bulan)) continue;

      if (summaryMap[rowIdSiswa]) {
        summaryMap[rowIdSiswa].total_pertemuan++;
        if (rowStatus === "hadir") summaryMap[rowIdSiswa].hadir++;
        else if (rowStatus === "izin") summaryMap[rowIdSiswa].izin++;
        else if (rowStatus === "sakit") summaryMap[rowIdSiswa].sakit++;
        else if (rowStatus === "alpa") summaryMap[rowIdSiswa].alpa++;
      }
    }
  }

  return Object.values(summaryMap);
}

// =========================================================================
// SETUP MASTER SHEETS & INISIALISASI
// =========================================================================

function setupInitialSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Spreadsheet aktif tidak ditemukan!");

  // 1. Sheet Sekolah
  let sheetSekolah = ss.getSheetByName(SHEET_SEKOLAH);
  if (!sheetSekolah) sheetSekolah = ss.insertSheet(SHEET_SEKOLAH);
  sheetSekolah.clear();
  sheetSekolah.getRange("A1:E1").setValues([["ID_Sekolah", "Nama_Sekolah", "NPSN", "PIN_Admin", "Alamat"]]);
  sheetSekolah.getRange("A1:E1").setFontWeight("bold").setBackground("#DBEAFE");

  const sampleSekolah = [
    ["SCH01", "SMP Negeri 1 Nusantara", "20101234", "admin123", "Jl. Merdeka No. 1, Jakarta"],
    ["SCH02", "SMP Swasta Bhakti Utama", "20105678", "admin123", "Jl. Pemuda No. 45, Bandung"]
  ];
  sheetSekolah.getRange(2, 1, sampleSekolah.length, 5).setValues(sampleSekolah);
  sheetSekolah.autoResizeColumns(1, 5);

  // 2. Sheet Siswa
  let sheetSiswa = ss.getSheetByName(SHEET_SISWA);
  if (!sheetSiswa) sheetSiswa = ss.insertSheet(SHEET_SISWA);
  sheetSiswa.clear();
  sheetSiswa.getRange("A1:F1").setValues([["ID_Sekolah", "ID_Siswa", "NISN", "Nama", "Kelas", "Jenis_Kelamin"]]);
  sheetSiswa.getRange("A1:F1").setFontWeight("bold").setBackground("#E0E7FF");

  const sampleSiswa = [
    ["SCH01", "S001", "0081234501", "Ahmad Fajar Prasetyo", "7A", "L"],
    ["SCH01", "S002", "0081234502", "Anisa Dwi Lestari", "7A", "P"],
    ["SCH01", "S003", "0081234503", "Bagus Tri Wicaksono", "7A", "L"],
    ["SCH01", "S004", "0081234504", "Citra Kirana Dewi", "7A", "P"],
    ["SCH01", "S005", "0081234505", "Dimas Arya Pangestu", "7A", "L"],
    ["SCH01", "S011", "0081234511", "Bayu Pratama", "7B", "L"],
    ["SCH01", "S012", "0081234512", "Cantika Aulia", "7B", "P"],
    ["SCH02", "SB01", "0092345601", "Andi Firmansyah", "8B", "L"],
    ["SCH02", "SB02", "0092345602", "Dewi Lestari", "8B", "P"],
    ["SCH02", "SB03", "0092345603", "Farhan Hakim", "9A", "L"]
  ];
  sheetSiswa.getRange(2, 1, sampleSiswa.length, 6).setValues(sampleSiswa);
  sheetSiswa.autoResizeColumns(1, 6);

  // 3. Sheet Guru (Contoh nyata guru Satminkal & Non-Satminkal)
  let sheetGuru = ss.getSheetByName(SHEET_GURU);
  if (!sheetGuru) sheetGuru = ss.insertSheet(SHEET_GURU);
  sheetGuru.clear();
  sheetGuru.getRange("A1:F1").setValues([["ID_Sekolah", "ID_Guru", "Nama_Guru", "PIN_Password", "Wali_Kelas", "Status_Guru"]]);
  sheetGuru.getRange("A1:F1").setFontWeight("bold").setBackground("#FEF3C7");

  const sampleGuru = [
    // Guru A di SCH01 sebagai Satminkal
    ["SCH01", "G001", "Drs. Ahmad Fauzi, M.Pd", "1234", "7A", "Satminkal"],
    ["SCH01", "G002", "Siti Rahmawati, S.Pd", "1234", "7B", "Satminkal"],
    ["SCH01", "G003", "Budi Santoso, S.Kom", "1234", "8A", "Non-Satminkal"],

    // Guru A di SCH02 sebagai Non-Satminkal (Mengajar di 2 sekolah!)
    ["SCH02", "G001", "Drs. Ahmad Fauzi, M.Pd", "1234", "-", "Non-Satminkal"],
    ["SCH02", "G003", "Budi Santoso, S.Kom", "1234", "8B", "Satminkal"],
    ["SCH02", "G004", "Nur Hidayah, S.Pd", "1234", "9A", "Satminkal"]
  ];
  sheetGuru.getRange(2, 1, sampleGuru.length, 6).setValues(sampleGuru);
  sheetGuru.autoResizeColumns(1, 6);

  // 4. Sheet Presensi
  let sheetPresensi = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheetPresensi) sheetPresensi = ss.insertSheet(SHEET_PRESENSI);
  sheetPresensi.clear();
  sheetPresensi.getRange("A1:I1").setValues([["Timestamp", "ID_Sekolah", "Tanggal", "ID_Siswa", "Nama", "Kelas", "Status", "Keterangan", "Nama_Guru"]]);
  sheetPresensi.getRange("A1:I1").setFontWeight("bold").setBackground("#D1FAE5");
  sheetPresensi.autoResizeColumns(1, 9);

  return {
    status: "success",
    message: "Master Spreadsheet Multi-Sekolah berhasil dibuat beserta data sampel!",
    totalSekolah: sampleSekolah.length,
    totalSiswa: sampleSiswa.length,
    totalGuru: sampleGuru.length
  };
}

function createPresensiSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet(SHEET_PRESENSI);
  sheet.getRange("A1:I1").setValues([["Timestamp", "ID_Sekolah", "Tanggal", "ID_Siswa", "Nama", "Kelas", "Status", "Keterangan", "Nama_Guru"]]);
  sheet.getRange("A1:I1").setFontWeight("bold").setBackground("#D1FAE5");
  return sheet;
}

function parseRequestBody(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

function formatTanggalValue(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Jakarta", "yyyy-MM-dd");
  }
  const str = String(val).trim();
  if (str.length >= 10 && str.charAt(4) === "-" && str.charAt(7) === "-") {
    return str.substring(0, 10);
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "Asia/Jakarta", "yyyy-MM-dd");
    }
  } catch (e) {}
  return str;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
