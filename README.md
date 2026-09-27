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

## 🗄️ Struktur Data Google Sheets

Aplikasi mendukung skema tabel berikut:

### 1. Sheet `Siswa`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `ID_Siswa` | Text | `S001` |
| `NISN` | Text | `0081234501` |
| `Nama` | Text | `Ahmad Fajar Prasetyo` |
| `Kelas` | Text | `7A` |
| `Jenis_Kelamin` | Text | `L` atau `P` |

### 2. Sheet `Presensi`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `Timestamp` | Text / Datetime | `2026-09-27 07:45:00` |
| `Tanggal` | Text (YYYY-MM-DD) | `2026-09-27` |
| `ID_Siswa` | Text | `S001` |
| `Nama` | Text | `Ahmad Fajar Prasetyo` |
| `Kelas` | Text | `7A` |
| `Status` | Text | `Hadir` / `Izin` / `Sakit` / `Alpa` |
| `Keterangan` | Text | `Demam tinggi` |
| `Nama_Guru` | Text | `Drs. Ahmad Fauzi, M.Pd` |

### 3. Sheet `Guru`
| Kolom | Tipe Data | Contoh Nilai |
|---|---|---|
| `ID_Guru` | Text | `G001` |
| `Nama_Guru` | Text | `Drs. Ahmad Fauzi, M.Pd` |
| `PIN_Password` | Text | `1234` |
| `Wali_Kelas` | Text | `7A` |

---

## 🔐 Sistem Autentikasi & Hak Akses Akun

Aplikasi menggunakan sistem autentikasi saat pertama kali dibuka dengan pembagian peran yang ketat:

### 1. 🛡️ Akun Admin Sekolah (Portal Konfigurasi Database & Manajemen Data)
- **Akses:** Tab **"Admin Sekolah"** di layar awal.
- **Password Default:** `admin123` *(dapat diganti melalui menu keamanan admin)*.
- **Fungsi Khusus:**
  - **Manajemen Siswa:** Tombol **"+ Tambah Siswa"** untuk menambahkan siswa baru (Nama, Kelas, Jenis Kelamin, NISN) langsung ke Sheet `Siswa`.
  - **Manajemen Guru:** Tombol **"+ Tambah Guru"** untuk mendaftarkan akun guru baru (Nama, NIP/ID Unik, PIN, Wali Kelas) langsung ke Sheet `Guru`.
  - Memasukkan & menyimpan Web App URL Google Apps Script.
  - Menjalankan **Tes Koneksi API** ke Google Sheets.
  - Melakukan **Setup Otomatis Tabel Spreadsheet** (membuat sheet `Siswa`, `Presensi`, dan `Guru`).
  - Menyinkronkan daftar guru pengajar dan kelas dari Spreadsheet.
  - Mengubah password administrator.

### 2. 👨‍🏫 Akun Guru Pengajar (Presensi & Rekap Kehadiran)
- **Akses:** Tab **"Guru Pengajar"** di layar awal.
- **Identitas Unik (ID / NIP):** Setiap guru memiliki **ID_Guru / NIP unik**. 
  - Jika ada guru dengan **nama yang sama**, sistem membedakannya dari **NIP / ID Guru** yang tertera di menu dropdown (misal: *Siti Rahmawati - ID: G002* vs *Siti Rahmawati - ID: G005*).
  - Jika ada guru dengan **PIN / Password yang sama** (misal sama-sama menggunakan PIN bawaan `1234`), hal ini **tidak akan tertukar/bentrok**, karena sistem mencocokkan ID Guru yang dipilih terlebih dahulu baru memverifikasi PIN.
- **Fungsi Khusus:**
  - Input presensi harian per kelas dan tanggal dengan cepat.
  - Tombol cepat **"Set Semua Hadir"** dan input keterangan izin/sakit/alpa.
  - Tab **Riwayat Kehadiran** dan **Rekap Bulanan**.
  - **Bebas Konfigurasi Teknis:** Guru **tidak melihat** konfigurasi Google Sheets URL sehingga antarmuka tetap bersih, fokus, dan aman dari salah ubah.

---

## 🚀 Panduan Setup Backend (Google Apps Script)

1. Buka spreadsheet baru di [Google Sheets](https://sheets.new).
2. Pada menu atas, klik **Ekstensi (Extensions)** > **Apps Script**.
3. Buka file [`apps-script/Code.gs`](file:///C:/Users/ASUS/.gemini/antigravity-ide/scratch/presensi-siswa-app/apps-script/Code.gs) pada repositori ini, salin seluruh kodenya dan tempel ke editor Apps Script.
4. Simpan (`Ctrl + S`).
5. Klik **Terapkan (Deploy)** di pojok kanan atas > **Penerapan Baru (New deployment)**.
6. Pilih jenis: **Aplikasi Web (Web app)**.
7. Isi form:
   - **Deskripsi:** `API Presensi Siswa v1`
   - **Jalankan sebagai (Execute as):** `Saya (Me)`
   - **Siapa yang memiliki akses (Who has access):** **`Siapa saja (Anyone)`** *(Wajib dipilih Anyone)*.
8. Klik **Terapkan (Deploy)**, berikan otorisasi izin akun Google jika diminta.
9. Salin **URL Aplikasi Web** yang berakhiran `/exec`.
10. Buka aplikasi, pilih tab **Admin Sekolah** (PIN: `admin123`), tempel URL tersebut, lalu klik **"Simpan URL"** dan **"Tes Koneksi"**.
11. Klik tombol **"Setup Otomatis Tabel Spreadsheet"** untuk membuat sheet dan mengisinya dengan data sampel secara otomatis.
12. Guru kini dapat langsung login dan mulai mencatat kehadiran siswa!

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
