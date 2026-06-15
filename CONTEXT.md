# ERP Roti Maryam - Context File

## Stack
- Next.js + Supabase + Tailwind CSS
- Local: localhost:3000
- Supabase Project ID: vauqcjzgvnfhrervpozl
- GitHub: github.com/irfanrawther/erp-roti-maryam

## Brands
1. Cane RawtheR
2. Mehana Boga Utama

## Sidebar Menu
- Dashboard
- Produksi (icon: Workflow) → 2 tab: Bahan Baku | Alur Produksi
- Pengiriman
- Kelola User
- Master Resep Adonan

## Fitur Per Halaman

### Dashboard
- Card: Bahan Baku (jumlah + kritis), Batch Aktif, Total SKU, Kiriman Hari Ini
- Batch Adonan (aktif)
- Stok Produk Jadi (per brand, per varian)

### Produksi - Tab Bahan Baku
- List 14 bahan baku + stok saat ini + minimum stok
- Tombol Tambah/Kurangi per bahan
- Tab: Stok Saat Ini | Riwayat Penerimaan/Pengurangan | Riwayat Pemakaian
- Filter tanggal: Hari ini, Kemarin, 7 hari, 1 bulan, Custom range (real-time)
- Keterangan pengurangan stok (tanda panah merah)

### Produksi - Tab Alur Produksi
Flow: Adonan → Rendam → Packing & Freezer → Riwayat | Laporan Reject

STAGE ADONAN:
- 2 card: Cane RawtheR & Mehana Boga Utama
- Input kg per varian masing-masing
- Cane RawtheR: Original, Melted Choco, Grated Cheese, Whole Wheat
- Mehana: Original, Cokelat, Keju
- Tombol: [Undo] [Tersimpan] [Pindah ke Rendam →]
- Saat simpan: stok bahan baku langsung berkurang
- State persistent (tidak reset saat pindah halaman)
- Cutoff jam 18.00 (lock + unlock via PIN Owner + alasan)

STAGE RENDAM:
- Langsung pindah tanpa modal saat klik "Pindah ke Rendam"
- Tampil: brand, varian, kg adonan, tanggal, user
- Tombol: [Pindah ke Packing & Freezer] [← Kembali ke Adonan]

STAGE PACKING & FREEZER:
- Modal saat klik "Input Stok":
  - Total Direndam (pcs)
  - Lebihan Carry-over (dari hari sebelumnya, per varian)
  - Total Available
  - Cane RawtheR: Isi 5 Pcs saja
  - Mehana: Isi 5 Pcs + Isi 10 Pcs
  - Reject (pcs)
  - Lebihan (pcs)
  - TOTAL CHECK: harus match dengan Total Available
  - Jika lebihan carry-over + lebihan hari ini ≥ 5 → wajib tambah pack
  - Konfirmasi disabled jika belum match
- Tombol: [Input Stok] [← Kembali ke Rendam]

### Master Resep Adonan
Cane RawtheR - 4 varian terpisah:
- Original (20 pcs/kg, 80gr/pcs)
- Melted Choco (25 pcs/kg, 65gr/pcs)
- Grated Cheese (25 pcs/kg, 65gr/pcs)
- Whole Wheat (20 pcs/kg, 80gr/pcs)

Resep per 1kg (semua varian sama kecuali tambahan):
- Terigu: 1 Kg
- Margarine Blue Band: 75 gr
- Garam: 17.5 gr
- Gula: 20 gr
- Air: 500 ml
- Minyak Resep: 50 ml
- Minyak Rendam: 100 ml
- Telur: 2 pcs
- Baking Powder: 10 gr
- Melted Choco tambahan: Mesis Tulip 500 gr
- Grated Cheese tambahan: Keju Kraft Martabak 500 gr
- Whole Wheat tambahan: Tepung Gandum 500 gr

Mehana Boga Utama - 3 varian:
- Original (45 pcs/kg)
- Cokelat (45 pcs/kg) + Mesis Innova 320 gr
- Keju (45 pcs/kg) + Keju Calf 320 gr

Resep Mehana per 1kg:
- Terigu: 1 Kg
- Garam: 17.5 gr
- Gula: 10 gr
- Air: 537 ml
- Minyak Resep: 50 ml
- Minyak Rendam: 100 ml

## Bahan Baku (14 item) - Stok Awal
Terigu: 500 Kg
Minyak: 500 Liter
Garam: 25 Kg
Gula: 50 Kg
Margarine Menara: 100 Kg
Mesis Innova: 100 Kg
Keju Calf: 32 Kg
Margarine Blue Band: 50 Kg
Mesis Tulip: 50 Kg
Keju Kraft Martabak: 16 Kg
Baking Powder: 1 Kg
Telur: 225 Pcs
Tepung Gandum: 5 Kg
Butter Hollmann: 1 Kg

## Stok Produk Jadi
Cane RawtheR: Original, Melted Choco, Grated Cheese, Whole Wheat (semua Isi 5)
Mehana: Original/Cokelat/Keju Isi 5 + Original/Cokelat/Keju Isi 10

## User & Roles
- Owner Admin: PIN 111111 (akses semua)
- Login via PIN 6 angka

## Pending / TODO
1. Cutoff jam 18.00 dengan unlock Owner (PIN + alasan + 30 menit window)
2. Riwayat + audit trail per action dengan timestamp
3. Laporan Reject (per hari, per bulan)
4. Carry-over lebihan antar hari per varian
5. Halaman Pengiriman (belum dibuat)
6. Multi-user & role management (Owner, SPV, Staff dengan keterbatasan fitur)
7. Deploy ke Vercel

## Known Issues
- Bug: Input Stok freeze setelah konfirmasi (sedang di-fix)
- 1 error di browser (belum diidentifikasi)
