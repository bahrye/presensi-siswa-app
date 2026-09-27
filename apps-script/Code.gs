/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - SISTEM PRESENSI SISWA ONLINE
 * Backend REST API untuk Aplikasi Android Presensi Siswa
 * =========================================================================
 *
 * Struktur Sheet yang Didukung:
 * 1. Sheet 'Siswa':
 *    ID_Siswa | NISN | Nama | Kelas | Jenis_Kelamin
 *
 * 2. Sheet 'Presensi':
 *    Timestamp | Tanggal | ID_Siswa | Nama | Kelas | Status | Keterangan | Nama_Guru
 *
 * 3. Sheet 'Guru':
 *    ID_Guru | Nama_Guru | PIN_Password | Wali_Kelas
 *
 * Petunjuk Deploy:
 * 1. Buka Google Spreadsheet baru / yang sudah ada.
 * 2. Buka menu Extensions (Ekstensi) > Apps Script.
 * 3. Hapus kode bawaan, lalu copy-paste seluruh kode di file ini.
 * 4. (PENTING) Pilih fungsi 'testRunSetup' atau 'setupInitialSheets' lalu klik Run (Jalankan)
 *    untuk membuat tabel dan memberikan otorisasi akun Google pertama kali.
 * 5. Klik tombol "Deploy" (Terapkan) > "New deployment" (Penerapan baru).
 * 6. Pilih jenis: "Web app" (Aplikasi web).
 * 7. Isi Konfigurasi:
 *    - Description: "API Presensi Siswa v1"
 *    - Execute as: "Me (email Anda)"
 *    - Who has access: "Anyone" (Siapa saja - PENTING agar Android bisa akses tanpa OAuth dialog)
 * 8. Klik "Deploy", lalu salin "Web app URL" (akhiran /exec) ke aplikasi Android.
 * =========================================================================
 */

// Konstanta Nama Sheet
const SHEET_SISWA = "Siswa";
const SHEET_PRESENSI = "Presensi";
const SHEET_GURU = "Guru";

/**
 * FUNGSI TEST RUNNER (Bisa langsung diklik Run / Jalankan di Apps Script Editor)
 * Otomatis mendeteksi spreadsheet aktif dan mengisi data contoh.
 */
function testRunSetup() {
  const result = setupInitialSheets();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Handler GET: Membaca data dari Spreadsheet
 * Mendukung parameter:
 * - action: 'ping' | 'get_init_data' | 'get_siswa' | 'get_presensi' | 'get_rekap' | 'setup_sheets'
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || "ping";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return createJsonResponse({
        status: "error",
        message: "Spreadsheet tidak terdeteksi. Pastikan Apps Script dibuka melalui menu Extensions > Apps Script pada Google Sheets."
      });
    }

    // 1. Tes Koneksi (Ping)
    if (action === "ping") {
      const sheets = ss.getSheets().map(s => s.getName());
      return createJsonResponse({
        status: "success",
        message: "Koneksi Google Apps Script berhasil terhubung!",
        spreadsheetTitle: ss.getName(),
        sheets: sheets,
        serverTime: new Date().toISOString()
      });
    }

    // 2. Setup Awal Otomatis (Membuat Sheet dan Data Sampel jika belum ada)
    if (action === "setup_sheets") {
      const result = setupInitialSheets(ss);
      return createJsonResponse(result);
    }

    // 3. Ambil Data Inisialisasi Aplikasi (Daftar Guru & Daftar Kelas)
    if (action === "get_init_data") {
      const guruSheet = ss.getSheetByName(SHEET_GURU);
      const siswaSheet = ss.getSheetByName(SHEET_SISWA);

      // Jika sheet belum lengkap, inisialisasi dulu
      if (!guruSheet || !siswaSheet) {
        setupInitialSheets(ss);
      }

      const guruList = getGuruListData(ss);
      const kelasList = getDistinctKelasData(ss);

      return createJsonResponse({
        status: "success",
        data: {
          guruList: guruList,
          kelasList: kelasList,
          serverDate: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd")
        }
      });
    }

    // 4. Ambil Data Siswa (Bisa difilter berdasarkan kelas)
    if (action === "get_siswa") {
      const filterKelas = (params.kelas || "").trim();
      const siswaList = getSiswaListData(ss, filterKelas);
      return createJsonResponse({
        status: "success",
        kelas: filterKelas || "SEMUA",
        total: siswaList.length,
        data: siswaList
      });
    }

    // 5. Ambil Riwayat Presensi Berdasarkan Tanggal dan Kelas
    if (action === "get_presensi") {
      const tanggal = params.tanggal || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
      const filterKelas = (params.kelas || "").trim();
      const presensiList = getPresensiData(ss, tanggal, filterKelas);

      return createJsonResponse({
        status: "success",
        tanggal: tanggal,
        kelas: filterKelas || "SEMUA",
        total: presensiList.length,
        data: presensiList
      });
    }

    // 6. Ambil Rekap Presensi Siswa per Periode / Kelas
    if (action === "get_rekap") {
      const filterKelas = (params.kelas || "").trim();
      const bulan = params.bulan || Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM");
      const rekap = getRekapData(ss, filterKelas, bulan);

      return createJsonResponse({
        status: "success",
        kelas: filterKelas,
        bulan: bulan,
        data: rekap
      });
    }

    // 7. Tambah Siswa Baru via GET (fallback)
    if (action === "add_siswa") {
      const result = addSiswaToSheet(ss, params);
      return createJsonResponse(result);
    }

    // 8. Tambah Guru Baru via GET (fallback)
    if (action === "add_guru") {
      const result = addGuruToSheet(ss, params);
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
 * Handler POST: Menerima data dari Android Client
 * Mendukung JSON payload pada body (Content-Type: application/json atau text/plain)
 */
function doPost(e) {
  try {
    const payload = parseRequestBody(e);
    const action = payload.action || "save_presensi";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      return createJsonResponse({
        status: "error",
        message: "Spreadsheet tidak terdeteksi. Pastikan Apps Script terhubung ke Google Sheets."
      });
    }

    // 1. Simpan Presensi Massal (Bulk Presensi)
    if (action === "save_presensi") {
      const result = saveBulkPresensi(ss, payload);
      return createJsonResponse(result);
    }

    // 2. Verifikasi Login Guru
    if (action === "login_guru") {
      const result = authenticateGuru(ss, payload);
      return createJsonResponse(result);
    }

    // 3. Setup Sheet via POST
    if (action === "setup_sheets") {
      const result = setupInitialSheets(ss);
      return createJsonResponse(result);
    }

    // 4. Tambah Siswa Baru
    if (action === "add_siswa") {
      const result = addSiswaToSheet(ss, payload);
      return createJsonResponse(result);
    }

    // 5. Tambah Guru Baru
    if (action === "add_guru") {
      const result = addGuruToSheet(ss, payload);
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

/**
 * Fungsi Menyimpan Data Presensi Massal ke Sheet 'Presensi'
 * Fitur cerdas: Melakukan replace jika presensi tanggal + kelas yang sama sudah pernah diinput
 * sehingga tidak menimbulkan duplikasi baris.
 */
function saveBulkPresensi(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const tanggal = (payload.tanggal || "").trim();
  const kelas = (payload.kelas || "").trim();
  const namaGuru = (payload.nama_guru || "-").trim();
  const items = payload.items; // Array of { id_siswa, nama, kelas, status, keterangan }

  if (!tanggal) {
    return { status: "error", message: "Parameter 'tanggal' wajib diisi (format: YYYY-MM-DD)." };
  }
  if (!kelas) {
    return { status: "error", message: "Parameter 'kelas' wajib diisi." };
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { status: "error", message: "Daftar kehadiran siswa (items) kosong." };
  }

  let sheetPresensi = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheetPresensi) {
    sheetPresensi = createPresensiSheet(ss);
  }

  const timestampNow = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  const lastRow = sheetPresensi.getLastRow();

  // Hapus data presensi lama untuk tanggal & kelas yang sama agar tidak duplikat (Smart Upsert)
  if (lastRow > 1) {
    const dataRange = sheetPresensi.getRange(2, 1, lastRow - 1, 8).getValues();
    const rowsToDelete = [];

    for (let i = 0; i < dataRange.length; i++) {
      const rowTanggal = formatTanggalValue(dataRange[i][1]);
      const rowKelas = String(dataRange[i][4] || "").trim();

      if (rowTanggal === tanggal && rowKelas.toLowerCase() === kelas.toLowerCase()) {
        rowsToDelete.push(i + 2); // 1-indexed baris sheet
      }
    }

    // Hapus dari baris terbawah ke atas agar index baris tidak bergeser
    for (let j = rowsToDelete.length - 1; j >= 0; j--) {
      sheetPresensi.deleteRow(rowsToDelete[j]);
    }
  }

  // Siapkan baris baru untuk ditambahkan
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
    const targetStartRow = sheetPresensi.getLastRow() + 1;
    sheetPresensi.getRange(targetStartRow, 1, rowsToInsert.length, 8).setValues(rowsToInsert);
  }

  return {
    status: "success",
    message: "Presensi berhasil disimpan ke Spreadsheet!",
    tanggal: tanggal,
    kelas: kelas,
    totalSiswa: items.length,
    summary: {
      hadir: statHadir,
      izin: statIzin,
      sakit: statSakit,
      alpa: statAlpa
    }
  };
}

/**
 * Autentikasi Guru berdasarkan Nama dan PIN
 */
function authenticateGuru(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const namaGuru = (payload.nama_guru || "").trim().toLowerCase();
  const idGuru = (payload.id_guru || "").trim().toLowerCase();
  const pin = String(payload.pin || "").trim();

  const sheetGuru = ss.getSheetByName(SHEET_GURU);
  if (!sheetGuru) {
    return { status: "error", message: "Sheet 'Guru' belum ditemukan di Spreadsheet." };
  }

  const lastRow = sheetGuru.getLastRow();
  if (lastRow <= 1) {
    return { status: "error", message: "Data Guru masih kosong di Spreadsheet." };
  }

  const values = sheetGuru.getRange(2, 1, lastRow - 1, 4).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowId = String(values[i][0]).trim().toLowerCase();
    const rowNama = String(values[i][1]).trim().toLowerCase();
    const rowPin = String(values[i][2]).trim();
    const rowWali = String(values[i][3]).trim();

    const matchUser = (idGuru && rowId === idGuru) || (namaGuru && rowNama === namaGuru);

    if (matchUser) {
      if (rowPin === pin || pin === "") {
        return {
          status: "success",
          message: "Login berhasil!",
          guru: {
            id_guru: values[i][0],
            nama_guru: values[i][1],
            wali_kelas: rowWali
          }
        };
      } else {
        return { status: "error", message: "PIN / Password salah." };
      }
    }
  }

  return { status: "error", message: "Guru dengan nama/ID tersebut tidak ditemukan." };
}

/**
 * Menambahkan Siswa Baru ke Sheet 'Siswa'
 */
function addSiswaToSheet(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetSiswa = ss.getSheetByName(SHEET_SISWA);
  if (!sheetSiswa) {
    setupInitialSheets(ss);
    sheetSiswa = ss.getSheetByName(SHEET_SISWA);
  }

  const nama = String(payload.nama || "").trim();
  const kelas = String(payload.kelas || "").trim();
  let nisn = String(payload.nisn || "").trim();
  let idSiswa = String(payload.id_siswa || "").trim();
  const jenisKelamin = String(payload.jenis_kelamin || "L").trim().toUpperCase();

  if (!nama) {
    return { status: "error", message: "Nama Siswa wajib diisi!" };
  }
  if (!kelas) {
    return { status: "error", message: "Kelas Siswa wajib diisi!" };
  }

  const lastRow = sheetSiswa.getLastRow();
  // Auto-generate id_siswa jika kosong
  if (!idSiswa) {
    let nextNum = lastRow;
    idSiswa = "S" + ("000" + nextNum).slice(-3);
  }
  if (!nisn) {
    nisn = "-";
  }

  // Cek duplikasi ID atau NISN jika diisi
  if (lastRow > 1) {
    const data = sheetSiswa.getRange(2, 1, lastRow - 1, 3).getValues();
    for (let i = 0; i < data.length; i++) {
      const existingId = String(data[i][0]).trim();
      const existingNisn = String(data[i][1]).trim();
      if (existingId.toLowerCase() === idSiswa.toLowerCase()) {
        return { status: "error", message: "ID Siswa '" + idSiswa + "' sudah digunakan. Gunakan ID lain." };
      }
      if (nisn !== "-" && existingNisn === nisn) {
        return { status: "error", message: "NISN '" + nisn + "' sudah terdaftar atas nama siswa lain." };
      }
    }
  }

  // Tambahkan baris baru
  const targetRow = lastRow + 1;
  sheetSiswa.getRange(targetRow, 1, 1, 5).setValues([[idSiswa, nisn, nama, kelas, jenisKelamin]]);

  return {
    status: "success",
    message: "Siswa " + nama + " (" + kelas + ") berhasil ditambahkan!",
    data: {
      id_siswa: idSiswa,
      nisn: nisn,
      nama: nama,
      kelas: kelas,
      jenis_kelamin: jenisKelamin
    }
  };
}

/**
 * Menambahkan Guru Baru ke Sheet 'Guru'
 */
function addGuruToSheet(ss, payload) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetGuru = ss.getSheetByName(SHEET_GURU);
  if (!sheetGuru) {
    setupInitialSheets(ss);
    sheetGuru = ss.getSheetByName(SHEET_GURU);
  }

  const namaGuru = String(payload.nama_guru || "").trim();
  let idGuru = String(payload.id_guru || "").trim();
  const pin = String(payload.pin || payload.pin_password || "1234").trim();
  const waliKelas = String(payload.wali_kelas || "-").trim();

  if (!namaGuru) {
    return { status: "error", message: "Nama Guru wajib diisi!" };
  }
  if (!idGuru) {
    const nextNum = sheetGuru.getLastRow();
    idGuru = "G" + ("000" + nextNum).slice(-3);
  }

  // Cek apakah id_guru (NIP/Username) sudah terdaftar
  const lastRow = sheetGuru.getLastRow();
  if (lastRow > 1) {
    const data = sheetGuru.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      const existingId = String(data[i][0]).trim();
      if (existingId.toLowerCase() === idGuru.toLowerCase()) {
        return { status: "error", message: "ID Guru / NIP '" + idGuru + "' sudah digunakan. Harap gunakan ID / NIP lain." };
      }
    }
  }

  // Tambahkan baris baru
  const targetRow = lastRow + 1;
  sheetGuru.getRange(targetRow, 1, 1, 4).setValues([[idGuru, namaGuru, pin, waliKelas]]);

  return {
    status: "success",
    message: "Guru " + namaGuru + " (ID: " + idGuru + ") berhasil ditambahkan!",
    data: {
      id_guru: idGuru,
      nama_guru: namaGuru,
      pin: pin,
      wali_kelas: waliKelas
    }
  };
}

/**
 * Mengambil daftar Guru dari Sheet 'Guru'
 */
function getGuruListData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_GURU);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const list = [];

  for (let i = 0; i < data.length; i++) {
    if (data[i][1]) {
      list.push({
        id_guru: String(data[i][0] || ""),
        nama_guru: String(data[i][1] || ""),
        pin: String(data[i][2] || ""),
        wali_kelas: String(data[i][3] || "")
      });
    }
  }
  return list;
}

/**
 * Mengambil daftar kelas unik dari Sheet 'Siswa'
 */
function getDistinctKelasData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SISWA);
  if (!sheet) return ["7A", "7B", "8A", "8B", "9A"];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ["7A", "7B", "8A", "8B", "9A"];

  const data = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  const kelasSet = {};

  for (let i = 0; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) {
      kelasSet[k] = true;
    }
  }

  const result = Object.keys(kelasSet).sort();
  return result.length > 0 ? result : ["7A", "7B", "8A", "8B", "9A"];
}

/**
 * Mengambil data siswa dari Sheet 'Siswa'
 */
function getSiswaListData(ss, filterKelas) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SISWA);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const list = [];

  for (let i = 0; i < data.length; i++) {
    const idSiswa = String(data[i][0] || "").trim();
    const nisn = String(data[i][1] || "").trim();
    const nama = String(data[i][2] || "").trim();
    const kelas = String(data[i][3] || "").trim();
    const jk = String(data[i][4] || "L").trim().toUpperCase();

    if (!nama) continue;

    if (!filterKelas || kelas.toLowerCase() === filterKelas.toLowerCase()) {
      list.push({
        id_siswa: idSiswa,
        nisn: nisn,
        nama: nama,
        kelas: kelas,
        jenis_kelamin: jk
      });
    }
  }

  // Urutkan berdasarkan Nama secara alfabetis
  list.sort((a, b) => a.nama.localeCompare(b.nama));
  return list;
}

/**
 * Mengambil data presensi dari Sheet 'Presensi'
 */
function getPresensiData(ss, tanggal, filterKelas) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const list = [];

  for (let i = 0; i < data.length; i++) {
    const rowTanggal = formatTanggalValue(data[i][1]);
    const rowKelas = String(data[i][4] || "").trim();

    const matchTanggal = (!tanggal || rowTanggal === tanggal);
    const matchKelas = (!filterKelas || rowKelas.toLowerCase() === filterKelas.toLowerCase());

    if (matchTanggal && matchKelas) {
      list.push({
        timestamp: String(data[i][0] || ""),
        tanggal: rowTanggal,
        id_siswa: String(data[i][2] || ""),
        nama: String(data[i][3] || ""),
        kelas: rowKelas,
        status: String(data[i][5] || "Hadir"),
        keterangan: String(data[i][6] || ""),
        nama_guru: String(data[i][7] || "")
      });
    }
  }

  return list;
}

/**
 * Menghitung Rekapitulasi Presensi per Siswa
 */
function getRekapData(ss, filterKelas, bulan) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const siswaList = getSiswaListData(ss, filterKelas);
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
    const data = sheetPresensi.getRange(2, 1, lastRow - 1, 8).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowTanggal = formatTanggalValue(data[i][1]);
      const rowIdSiswa = String(data[i][2] || "").trim();
      const rowStatus = String(data[i][5] || "").trim().toLowerCase();

      // Cek apakah tanggal sesuai bulan (YYYY-MM)
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

/**
 * Setup Initial Sheets dengan Data Sampel Lengkap
 * (Bisa dijalankan langsung lewat tombol 'Run/Jalankan' di editor Apps Script)
 */
function setupInitialSheets(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) {
    throw new Error("Spreadsheet aktif tidak ditemukan! Pastikan Apps Script ini dibuka melalui menu 'Ekstensi' > 'Apps Script' di dalam Google Spreadsheet Anda.");
  }

  // 1. Sheet Siswa
  let sheetSiswa = ss.getSheetByName(SHEET_SISWA);
  if (!sheetSiswa) {
    sheetSiswa = ss.insertSheet(SHEET_SISWA);
  }
  sheetSiswa.clear();
  sheetSiswa.getRange("A1:E1").setValues([["ID_Siswa", "NISN", "Nama", "Kelas", "Jenis_Kelamin"]]);
  sheetSiswa.getRange("A1:E1").setFontWeight("bold").setBackground("#E0E7FF");

  const sampleSiswa = [
    ["S001", "0081234501", "Ahmad Fajar Prasetyo", "7A", "L"],
    ["S002", "0081234502", "Anisa Dwi Lestari", "7A", "P"],
    ["S003", "0081234503", "Bagus Tri Wicaksono", "7A", "L"],
    ["S004", "0081234504", "Citra Kirana Dewi", "7A", "P"],
    ["S005", "0081234505", "Dimas Arya Pangestu", "7A", "L"],
    ["S006", "0081234506", "Eka Putri Maharani", "7A", "P"],
    ["S007", "0081234507", "Fathan Muhammad Alif", "7A", "L"],
    ["S008", "0081234508", "Gita Savitri Wulandari", "7A", "P"],
    ["S009", "0081234509", "Haikal Kurniawan", "7A", "L"],
    ["S010", "0081234510", "Indah Permatasari", "7A", "P"],
    ["S011", "0081234511", "Bayu Pratama", "7B", "L"],
    ["S012", "0081234512", "Cantika Aulia", "7B", "P"],
    ["S013", "0081234513", "Deni Saputra", "7B", "L"],
    ["S014", "0081234514", "Fatimah Zahra", "7B", "P"],
    ["S015", "0081234515", "Gilang Ramadhan", "7B", "L"],
    ["S016", "0081234516", "Aditya Nugraha", "8A", "L"],
    ["S017", "0081234517", "Bella Safitri", "8A", "P"],
    ["S018", "0081234518", "Candra Wijaya", "8A", "L"],
    ["S019", "0081234519", "Diana Puspita", "8A", "P"],
    ["S020", "0081234520", "Eko Prasetyo", "8A", "L"]
  ];
  sheetSiswa.getRange(2, 1, sampleSiswa.length, 5).setValues(sampleSiswa);
  sheetSiswa.autoResizeColumns(1, 5);

  // 2. Sheet Presensi
  let sheetPresensi = ss.getSheetByName(SHEET_PRESENSI);
  if (!sheetPresensi) {
    sheetPresensi = ss.insertSheet(SHEET_PRESENSI);
  }
  sheetPresensi.clear();
  sheetPresensi.getRange("A1:H1").setValues([["Timestamp", "Tanggal", "ID_Siswa", "Nama", "Kelas", "Status", "Keterangan", "Nama_Guru"]]);
  sheetPresensi.getRange("A1:H1").setFontWeight("bold").setBackground("#D1FAE5");
  sheetPresensi.autoResizeColumns(1, 8);

  // 3. Sheet Guru
  let sheetGuru = ss.getSheetByName(SHEET_GURU);
  if (!sheetGuru) {
    sheetGuru = ss.insertSheet(SHEET_GURU);
  }
  sheetGuru.clear();
  sheetGuru.getRange("A1:D1").setValues([["ID_Guru", "Nama_Guru", "PIN_Password", "Wali_Kelas"]]);
  sheetGuru.getRange("A1:D1").setFontWeight("bold").setBackground("#FEF3C7");

  const sampleGuru = [
    ["G001", "Drs. Ahmad Fauzi, M.Pd", "1234", "7A"],
    ["G002", "Siti Rahmawati, S.Pd", "1234", "7B"],
    ["G003", "Budi Santoso, S.Kom", "1234", "8A"],
    ["G004", "Nur Hidayah, S.Pd", "1234", "9A"]
  ];
  sheetGuru.getRange(2, 1, sampleGuru.length, 4).setValues(sampleGuru);
  sheetGuru.autoResizeColumns(1, 4);

  return {
    status: "success",
    message: "Sheet 'Siswa', 'Presensi', dan 'Guru' berhasil dibuat beserta data sampel!",
    totalSiswa: sampleSiswa.length,
    totalGuru: sampleGuru.length
  };
}

function createPresensiSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet(SHEET_PRESENSI);
  sheet.getRange("A1:H1").setValues([["Timestamp", "Tanggal", "ID_Siswa", "Nama", "Kelas", "Status", "Keterangan", "Nama_Guru"]]);
  sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#D1FAE5");
  return sheet;
}

/**
 * Utilitas Parser Request Body
 */
function parseRequestBody(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // Jika format form-urlencoded
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

/**
 * Utilitas Format Tanggal ke YYYY-MM-DD
 */
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

/**
 * Utilitas Response JSON untuk Web App Google Apps Script
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
