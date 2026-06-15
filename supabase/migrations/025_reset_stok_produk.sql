-- ============================================================
-- 025_reset_stok_produk.sql
-- Reset semua stok produk jadi ke 0.
-- Stok hanya bertambah via Input Stok di halaman Produksi.
-- Jalankan di Supabase SQL Editor.
-- ============================================================

UPDATE produk_sku SET stok_saat_ini = 0;

-- Nonaktifkan trigger lama yg menambah stok saat status='freezer'
-- (sekarang stok dikelola manual via adjustProdukJadi di app)
DROP TRIGGER IF EXISTS trg_stok_produk_freezer ON batch_produksi;

-- Verifikasi
SELECT kode_sku, varian, isi_per_pack, stok_saat_ini FROM produk_sku ORDER BY brand, isi_per_pack, varian;
