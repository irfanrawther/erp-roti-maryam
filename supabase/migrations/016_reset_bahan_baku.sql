-- ============================================================
-- 016_reset_bahan_baku.sql
-- Bersihkan bahan baku: nonaktifkan yg tidak dipakai,
-- set stok awal untuk 14 bahan yang aktif.
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Nonaktifkan bahan yang tidak ada di list
UPDATE bahan_baku
SET aktif = false
WHERE nama IN ('Air', 'Minyak Resep', 'Minyak Rendam');

-- 2. Pastikan 14 bahan di list aktif dan satuan benar
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Terigu';
UPDATE bahan_baku SET aktif = true, satuan = 'Liter' WHERE nama = 'Minyak';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Garam';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Gula';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET aktif = true, satuan = 'Pcs'   WHERE nama = 'Telur';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Butter Hollmann';

-- 3. Set stok awal langsung (bypass trigger — ini penetapan stok awal, bukan transaksi)
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Terigu';
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Minyak';
UPDATE bahan_baku SET stok_saat_ini = 25   WHERE nama = 'Garam';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Gula';
UPDATE bahan_baku SET stok_saat_ini = 100  WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET stok_saat_ini = 100  WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET stok_saat_ini = 32   WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET stok_saat_ini = 16   WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET stok_saat_ini = 1    WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET stok_saat_ini = 225  WHERE nama = 'Telur';
UPDATE bahan_baku SET stok_saat_ini = 5    WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET stok_saat_ini = 1    WHERE nama = 'Butter Hollmann';

-- 4. Verifikasi — harus menampilkan tepat 14 baris
SELECT nama, satuan, stok_saat_ini, stok_minimum, aktif
FROM bahan_baku
WHERE aktif = true
ORDER BY nama;
