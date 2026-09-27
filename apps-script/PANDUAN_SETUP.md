# Panduan Setup Google Sheets & Google Apps Script (Backend REST API)

Dokumen ini memandu Anda menghubungkan Google Sheets dengan Aplikasi Android **Presensi Siswa**.

---

### Langkah 1: Buat Google Spreadsheet Baru
1. Buka browser dan kunjungi [Google Sheets](https://sheets.new).
2. Beri nama Spreadsheet, misalnya: **`Database Presensi Siswa 2026`**.
3. (Opsional) Anda tidak perlu repot membuat tabel secara manual karena skrip ini memiliki fitur **Auto Setup** yang otomatis membuat Sheet `Siswa`, `Presensi`, dan `Guru` beserta data awal!

---

### Langkah 2: Masukkan Kode Apps Script
1. Pada menu Google Sheets di bagian atas, klik:
   **Ekstensi** > **Apps Script** (atau *Extensions* > *Apps Script*).
2. Editor Apps Script akan terbuka di tab baru.
3. Hapus seluruh isi fungsi bawaan `myFunction()`.
4. Buka file [`Code.gs`](file:///C:/Users/ASUS/.gemini/antigravity-ide/scratch/presensi-siswa-app/apps-script/Code.gs), salin seluruh kodenya, lalu tempel (paste) ke editor Apps Script.
5. Klik ikon **Simpan (Save)** (ikon disket) atau tekan `Ctrl + S`.
6. (Opsional tapi direkomendasikan): Pada dropdown fungsi di atas tombol Simpan, pilih fungsi **`testRunSetup`** atau **`setupInitialSheets`**, lalu klik **Run (Jalankan)**.
   - Google akan meminta otorisasi izin pertama kali: Klik *Review permissions* > Pilih akun Google Anda > Klik *Advanced* > Klik *Go to Untitled project (unsafe)* > Klik *Allow*.
   - Periksa kembali tab Spreadsheet Anda, 3 sheet (`Siswa`, `Presensi`, `Guru`) otomatis langsung terisi data sampel!

---

### Langkah 3: Deploy sebagai Web App (PENTING!)
Agar aplikasi Android dapat mengakses API tanpa error CORS atau login Google berulang-ulang, ikuti konfigurasi ini dengan teliti:

1. Di pojok kanan atas editor Apps Script, klik tombol biru **Terapkan (Deploy)** > **Penerapan Baru (New deployment)**.
2. Klik ikon gerigi (Select type) di samping kiri, lalu pilih **Aplikasi Web (Web app)**.
3. Konfigurasikan form persis seperti berikut:
   - **Deskripsi:** `API Presensi Siswa v1`
   - **Jalankan sebagai (Execute as):** `Saya (email_anda@gmail.com)` *(Me)*
   - **Siapa yang memiliki akses (Who has access):** **`Siapa saja`** *(Anyone)*  
     *(⚠️ PENTING: Harus dipilih **Siapa Saja / Anyone** agar Android HP guru bisa kirim data tanpa meminta login akun Google)*.
4. Klik tombol **Terapkan (Deploy)**.
5. Salin link **URL Aplikasi Web (Web App URL)** yang berakhiran `/exec`.
   Contoh format URL:
   `https://script.google.com/macros/s/AKfycbxAbCdEfGhIjKlMnOpQrStUvWxYz12345/exec`

---

### Langkah 4: Masukkan URL ke Aplikasi Android
1. Buka aplikasi **Presensi Siswa** di Android atau browser preview.
2. Buka menu **Pengaturan (Ikon Gerigi)** di pojok kanan atas.
3. Masukkan / tempel Web App URL tersebut ke kolom **Google Apps Script Web App URL**.
4. Klik tombol **"Tes Koneksi"**.
5. Jika muncul pesan *"Koneksi Berhasil!"*, aplikasi siap digunakan untuk input presensi!
