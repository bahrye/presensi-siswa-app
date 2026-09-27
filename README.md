# 📱 Aplikasi Presensi Siswa (Android & Google Sheets Cloud Sync)

Aplikasi Android modern untuk pencatatan dan pengelolaan presensi / kehadiran siswa oleh guru secara cepat dan akurat, terintegrasi langsung dengan **Google Sheets** sebagai database utama melalui **Google Apps Script REST API**.

---

## 🌟 Fitur Utama

1. **⚡ Fast Input Presensi:**
   - Default status otomatis terpilih **Hadir (H)** untuk mempercepat input guru.
   - Pilihan status presensi interaktif: **Hadir (H)**, **Izin (I)**, **Sakit (S)**, **Alpa (A)** dengan chip warna dinamis.
   - Tombol instan **"Set Semua Hadir"** dengan 1 kali klik.
   - Input catatan / keterangan otomatis muncul jika memilih Izin, Sakit, atau Alpa dengan preset cepat (*Demam, Acara Keluarga, Surat Dokter, Tanpa Kabar*).
   - Pencarian siswa langsung berdasarkan nama atau NISN.

2. **📊 Live Summary & Validasi:**
   - Counter kehadiran real-time di bar bawah: `H: 28 | I: 1 | S: 1 | A: 0`.
   - Dialog konfirmasi ringkasan kehadiran sebelum data dikirim ke spreadsheet.

3. **☁️ Integrasi Google Sheets via Apps Script:**
   - Endpoint REST API fleksibel (`doGet` & `doPost`).
   - Fitur **Smart Upsert**: Memperbarui baris jika tanggal & kelas sudah pernah diinput sehingga mencegah duplikasi baris data di Spreadsheet.
   - Fitur **Auto-Setup**: 1-klik untuk otomatis membuat dan memformat sheet `Siswa`, `Presensi`, dan `Guru` beserta data awal langsung dari aplikasi!

4. **📶 Offline-First & Local Cache:**
   - Tetap dapat melakukan presensi meskipun di kelas tidak ada sinyal internet.
   - Data otomatis tersimpan di antrean lokal (**Offline Queue**) dan dapat disinkronkan ke Google Sheets kapan saja dengan tombol **"Sinkron Sekarang"**.

5. **🕒 Riwayat & Rekap Kehadiran:**
   - Tab **Riwayat**: Melihat log presensi per kelas dan tanggal tertentu lengkap dengan timestamp dan nama guru pencatat.
   - Tab **Rekap**: Rekapitulasi bulanan per siswa beserta persentase kehadiran (`% Hadir`).

6. **🎨 Antarmuka Modern & Haptic Feedback:**
   - Desain responsif standar Android modern (Material 3 & iOS HIG).
   - Dukungan **Dark Mode** & **Light Mode** elegan.
   - Efek suara dan getar haptic yang responsif saat memilih status kehadiran.

---

## 🗄️ Struktur Data Google Sheets Master (Multi-Sekolah)

Sistem menggunakan **1 Google Spreadsheet Master terpusat** dengan 4 sheet:

### 1. Sheet `Sekolah`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `ID_Sekolah` | Text | `SCH01` |
| `Nama_Sekolah` | Text | `SMP Negeri 1 Nusantara` |
| `NPSN` | Text | `20101234` |
| `PIN_Admin` | Text | `admin123` |
| `Alamat` | Text | `Jl. Merdeka No. 1, Jakarta` |

### 2. Sheet `Siswa`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `ID_Sekolah` | Text | `SCH01` |
| `ID_Siswa` | Text | `S001` |
| `NISN` | Text | `0081234501` |
| `Nama` | Text | `Ahmad Fajar Prasetyo` |
| `Kelas` | Text | `7A` |
| `Jenis_Kelamin` | Text | `L` atau `P` |

### 3. Sheet `Guru`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `ID_Sekolah` | Text | `SCH01` |
| `ID_Guru` | Text | `G001` |
| `Nama_Guru` | Text | `Drs. Ahmad Fauzi, M.Pd` |
| `PIN_Password` | Text | `1234` |
| `Wali_Kelas` | Text | `7A` |
| `Status_Guru` | Text | `Satminkal` atau `Non-Satminkal` |

### 4. Sheet `Presensi`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `Timestamp` | Text / Datetime | `2026-09-27 07:45:00` |
| `ID_Sekolah` | Text | `SCH01` |
| `Tanggal` | Text (YYYY-MM-DD) | `2026-09-27` |
| `ID_Siswa` | Text | `S001` |
| `Nama` | Text | `Ahmad Fajar Prasetyo` |
| `Kelas` | Text | `7A` |
| `Status` | Text | `Hadir` / `Izin` / `Sakit` / `Alpa` |
| `Keterangan` | Text | `Demam tinggi` |
| `Nama_Guru` | Text | `Drs. Ahmad Fauzi, M.Pd` |

---

## 🔐 Sistem Multi-Sekolah & Pembagian Peran

Aplikasi menggunakan sistem **Multi-Tenant Terpusat**:

### 1. 🏫 Pemilih Sekolah (School Switcher)
- Di bagian atas layar masuk, terdapat pemilih sekolah:  
  *Contoh: `[ SMP Negeri 1 Nusantara ▼ ]` atau `[ SMP Swasta Bhakti Utama ▼ ]`*
- Tombol **`+ Daftarkan Sekolah`**: Siapa pun admin baru dapat mendaftarkan sekolahnya langsung ke sistem!

### 2. 🛡️ Akun Admin Sekolah (Portal Khusus per Sekolah)
- **Akses:** Tab **"Admin Sekolah"** di layar awal.
- **Login:** Menggunakan PIN Admin milik sekolah terpilih (Default: `admin123`).
- **Fungsi Khusus:**
  - **Zero Config:** Admin sekolah **TIDAK PERLU** membuat spreadsheet atau menyetting Google Apps Script sendiri!
  - **Manajemen Siswa:** Tombol **"+ Tambah Siswa"** untuk menambahkan siswa baru khusus di sekolahnya.
  - **Manajemen Guru:** Tombol **"+ Tambah Guru"** untuk mendaftarkan guru baru dengan pilihan status: **`Satminkal`** (Guru Induk) atau **`Non-Satminkal`** (Guru Lintas Sekolah/Tamu).
  - Ganti PIN Admin sekolah.

### 3. 👨‍🏫 Akun Guru Pengajar (Mendukung Satminkal & Non-Satminkal)
- **Akses:** Tab **"Guru Pengajar"** di layar awal.
- **Kasus Guru Mengajar di 2 Sekolah Berbeda:**
  - Jika Guru A (NIP: `1985...`) mengajar di **SMP 1** (sebagai *Satminkal*) dan juga mengajar jam tambahan di **SMP 2** (sebagai *Non-Satminkal*):
  - Guru A cukup memilih sekolah yang dituju di bagian atas, lalu login dengan akun dan PIN-nya!
  - Data presensi otomatis masuk ke database sekolah yang dipilih tanpa saling mencampuri.
- **Fungsi Khusus:**
  - Input presensi harian per kelas dan tanggal dengan cepat.
  - Tombol cepat **"Set Semua Hadir"** dan input keterangan izin/sakit/alpa.
  - Tab **Riwayat Kehadiran** dan **Rekap Bulanan**.

---

## 🚀 Panduan Setup Backend Master (Cukup 1 Kali Saja)

Karena sistem menggunakan 1 Master Google Apps Script terpusat, pengembang/pusat hanya perlu men-deploy 1 kali saja:

1. Buka spreadsheet baru di [Google Sheets](https://sheets.new).
2. Pada menu atas, klik **Ekstensi (Extensions)** > **Apps Script**.
3. Buka file [`apps-script/Code.gs`](file:///C:/Users/ASUS/.gemini/antigravity-ide/scratch/presensi-siswa-app/apps-script/Code.gs) pada repositori ini, salin seluruh kodenya dan tempel ke editor Apps Script.
4. Klik tombol **Run (Jalankan)** pada fungsi `testRunSetup` untuk membuat 4 tabel otomatis dan mengotorisasi izin akun Google.
5. Klik **Terapkan (Deploy)** di pojok kanan atas > **Penerapan Baru (New deployment)**.
6. Pilih jenis: **Aplikasi Web (Web app)**.
7. Isi form:
   - **Deskripsi:** `Master Multi-School API v2`
   - **Jalankan sebagai (Execute as):** `Saya (Me)`
   - **Siapa yang memiliki akses (Who has access):** **`Siapa saja (Anyone)`**.
8. Klik **Terapkan (Deploy)**, salin **URL Aplikasi Web** yang berakhiran `/exec`.
9. Tempel URL tersebut di menu pengaturan server master aplikasi (atau tanamkan ke file `src/services/storage.js`).
10. Semua sekolah dan guru di seluruh penjuru siap menggunakan aplikasi tanpa perlu setup tambahan!

---

## 📦 Panduan Build APK Android

Proyek ini telah dikonfigurasi penuh dengan **Capacitor Native Android Container** di folder `android/`.

### Cara 1: Build APK Menggunakan Android Studio (Rekomendasi UI)
1. Buka aplikasi **Android Studio**.
2. Pilih **Open**, lalu arahkan ke folder:
   `C:\Users\ASUS\.gemini\antigravity-ide\scratch\presensi-siswa-app\android`
3. Tunggu hingga Gradle selesai melakukan sinkronisasi dependensi.
4. Pada menu bar Android Studio, klik:
   **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
5. Setelah selesai, file APK siap install akan berada di:
   `android/app/build/outputs/apk/debug/app-debug.apk`.

---

### Cara 2: Build APK via Terminal / Gradle CLI
Jika komputer Anda telah terpasang Java JDK 17 dan Android SDK:
```bash
# 1. Masuk ke folder proyek
cd C:\Users\ASUS\.gemini\antigravity-ide\scratch\presensi-siswa-app

# 2. Build web bundle terbaru dan sinkronkan ke Android
npm run build
npx cap sync android

# 3. Masuk ke folder android dan jalankan Gradle build
cd android
./gradlew assembleDebug
```
Output APK debug akan dihasilkan di folder `android/app/build/outputs/apk/debug/app-debug.apk`.

---

### Cara 3: Cloud Build Otomatis via GitHub Actions (Tanpa Perlu Install SDK di Komputer)
Repoisitori ini telah dilengkapi file workflow [`.github/workflows/build-apk.yml`](file:///C:/Users/ASUS/.gemini/antigravity-ide/scratch/presensi-siswa-app/.github/workflows/build-apk.yml).
1. Buat repository baru di akun GitHub Anda.
2. Push seluruh folder proyek ini ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: inisialisasi aplikasi presensi siswa android"
   git remote add origin https://github.com/USERNAME/presensi-siswa-app.git
   git branch -M main
   git push -u origin main
   ```
3. Buka tab **Actions** di repository GitHub Anda.
4. Workflow **Build Android APK** akan otomatis berjalan dan dalam 2-3 menit file **`Presensi-Siswa-Debug-APK`** siap diunduh di bagian *Artifacts*!

---

## 💻 Menjalankan di Mode Web / Browser Preview

Untuk melihat dan menguji aplikasi secara langsung di browser dengan responsive mobile preview:
```bash
npm run dev
```
Buka browser di `http://localhost:5173`.
