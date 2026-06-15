-- ============================================================
-- 023_full_reset.sql
-- Reset penuh: hapus semua riwayat & batch, reset stok awal
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Hapus semua batch produksi (semua status)
DELETE FROM batch_produksi;

-- 2. Hapus semua penggunaan bahan (linked ke batch)
DELETE FROM penggunaan_bahan;

-- 3. Hapus semua riwayat penerimaan/pengurangan bahan baku
DELETE FROM penerimaan_bahan_baku;

-- 4. Reset stok produk jadi ke 0
UPDATE produk_sku SET stok_saat_ini = 0 WHERE aktif = true;

-- 5. Reset stok bahan baku ke nilai awal
UPDATE bahan_baku SET stok_saat_ini = 500   WHERE nama = 'Terigu';
UPDATE bahan_baku SET stok_saat_ini = 500   WHERE nama = 'Minyak';
UPDATE bahan_baku SET stok_saat_ini = 25    WHERE nama = 'Garam';
UPDATE bahan_baku SET stok_saat_ini = 50    WHERE nama = 'Gula';
UPDATE bahan_baku SET stok_saat_ini = 190   WHERE nama = 'Air';
UPDATE bahan_baku SET stok_saat_ini = 100   WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET stok_saat_ini = 100   WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET stok_saat_ini = 32    WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET stok_saat_ini = 50    WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET stok_saat_ini = 50    WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET stok_saat_ini = 16    WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET stok_saat_ini = 1     WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET stok_saat_ini = 225   WHERE nama = 'Telur';
UPDATE bahan_baku SET stok_saat_ini = 5     WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET stok_saat_ini = 1     WHERE nama = 'Butter Hollmann';

-- Verifikasi
SELECT nama, stok_saat_ini, satuan FROM bahan_baku WHERE aktif = true ORDER BY nama;
SELECT 'Batch tersisa:' AS info, COUNT(*) AS jumlah FROM batch_produksi
UNION ALL
SELECT 'Riwayat penerimaan:', COUNT(*) FROM penerimaan_bahan_baku
UNION ALL
SELECT 'Penggunaan bahan:', COUNT(*) FROM penggunaan_bahan;
