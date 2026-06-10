# Panduan Deploy ERP Roti Maryam

## LANGKAH 1: Setup Database Supabase

1. Buka https://supabase.com dan login ke project Anda
2. Masuk ke menu **SQL Editor** (ikon database di sidebar kiri)
3. Klik **New Query**
4. Copy seluruh isi file `supabase/migrations/001_initial_schema.sql`
5. Paste ke SQL Editor, lalu klik **Run**
6. Tunggu sampai muncul "Success" di bawah

Ini akan:
- Membuat semua tabel yang dibutuhkan
- Mengisi data bahan baku awal (Cane & Mehana)
- Mengisi data SKU produk (9 SKU)
- Membuat user Owner dengan PIN awal: **111111**

> **PENTING**: Setelah login pertama, segera ganti PIN Owner melalui menu Admin → Kelola User

---

## LANGKAH 2: Install Node.js (jika belum ada)

1. Unduh Node.js dari https://nodejs.org (pilih versi LTS)
2. Install dengan klik Next terus
3. Restart komputer / terminal
4. Verifikasi: buka Command Prompt, ketik `node --version`

---

## LANGKAH 3: Install Dependencies

Buka Command Prompt / PowerShell, masuk ke folder project:
```
cd "C:\Users\irfan\Downloads\erp roti maryam"
npm install
```

---

## LANGKAH 4: Jalankan di Lokal (Development)

```
npm run dev
```

Buka browser: http://localhost:3000  
Login dengan PIN Owner: **111111**

---

## LANGKAH 5: Deploy ke Vercel

### Cara A: Via GitHub (Recommended)

1. Upload folder project ke GitHub:
   - Buat repo baru di github.com
   - Upload semua file (kecuali .env.local dan node_modules)

2. Buka https://vercel.com dan login
3. Klik **New Project** → Import dari GitHub
4. Pilih repo yang baru dibuat
5. Di bagian **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://vauqcjzgvnfhrervpozl.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (isi dengan anon key dari Supabase)
6. Klik **Deploy**

### Cara B: Via Vercel CLI

```
npm install -g vercel
vercel login
vercel --prod
```

Saat diminta, tambahkan environment variables yang sama seperti di atas.

---

## LANGKAH 6: Setup User Pertama Kali

1. Login ke aplikasi dengan PIN: `111111` (Owner Admin)
2. Masuk ke **Admin → Kelola User**
3. Tambahkan semua user beserta PIN masing-masing
4. Edit User "Owner Admin", ganti PIN menjadi PIN yang aman

---

## LANGKAH 7: Setup Master Resep

1. Login sebagai Owner atau Manager
2. Masuk ke **Admin → Master Resep**
3. Pilih setiap SKU produk satu per satu
4. Tambahkan bahan-bahan beserta jumlah per pack
5. Jumlah per pack = berapa satuan bahan yang dipakai untuk membuat 1 pack

Contoh untuk Cane Original (5pcs/pack):
- Terigu: 0.250 kg per pack
- Margarine Blue Band: 0.050 kg per pack
- dst...

---

## STRUKTUR FILE PENTING

```
erp roti maryam/
├── src/
│   ├── app/
│   │   ├── (auth)/login/          → Halaman login PIN
│   │   └── (dashboard)/
│   │       ├── dashboard/         → Dashboard utama
│   │       ├── bahan-baku/        → Modul penerimaan bahan
│   │       ├── produksi/          → Modul produksi adonan
│   │       ├── packing/           → Modul packing & freezer
│   │       ├── pengiriman/        → Modul pengiriman
│   │       └── admin/
│   │           ├── users/         → Kelola user & PIN
│   │           └── resep/         → Master resep
│   ├── components/layout/         → Sidebar & Header
│   ├── lib/
│   │   ├── supabase.ts            → Koneksi Supabase
│   │   └── auth.ts                → Auth dengan PIN
│   └── types/database.ts          → Type definitions
├── supabase/migrations/           → SQL schema
├── .env.local                     → Credentials (JANGAN diupload ke GitHub)
└── package.json
```

---

## TROUBLESHOOTING

**Error: "PIN tidak valid" padahal PIN benar**
- Pastikan schema SQL sudah dijalankan di Supabase
- Cek apakah PIN hash sudah sesuai (SHA-256)

**Stok bahan baku tidak berkurang saat produksi**
- Pastikan Master Resep sudah dikonfigurasi untuk SKU tersebut
- Masuk ke Admin → Master Resep dan isi resepnya

**Data tidak realtime / perlu refresh**
- Pastikan koneksi internet stabil
- Supabase Realtime harus aktif (default aktif)

**Build error di Vercel**
- Pastikan semua environment variables sudah diisi
- Cek log build di dashboard Vercel
