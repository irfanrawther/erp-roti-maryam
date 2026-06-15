-- ============================================================
-- 017_tambah_air.sql
-- Aktifkan kembali Air di bahan baku
-- Jalankan di Supabase SQL Editor
-- ============================================================

UPDATE bahan_baku
SET aktif = true, satuan = 'Liter', stok_saat_ini = 0
WHERE nama = 'Air';

-- Verifikasi urutan — Air harus muncul di bawah Gula
SELECT nama, satuan, stok_saat_ini, aktif
FROM bahan_baku
WHERE aktif = true
ORDER BY nama;
