-- ============================================================
-- 034_reset_baseline.sql
-- Reset PENUH semua data produksi, bahan baku, pengiriman,
-- dan adjustment ke baseline awal.
--
-- Jalankan di Supabase SQL Editor, lalu:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- 1. Hapus child tables (FK ke batch_produksi)
DELETE FROM penggunaan_bahan;
DELETE FROM packing_input;

-- 2. Hapus batch produksi (semua status)
DELETE FROM batch_produksi;

-- 3. Hapus riwayat penerimaan & pengurangan bahan baku
--    (termasuk entri produksi, manual, proses_bikin, pengiriman)
DELETE FROM penerimaan_bahan_baku;

-- 4. Hapus adjustment bahan baku
DELETE FROM adjustment_bahan_baku;

-- 5. Hapus pengiriman
DELETE FROM pengiriman;

-- 6. Hapus tabel opsional (skip jika belum ada / nama berbeda)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reject_log')         THEN DELETE FROM reject_log; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lebihan_carry_over') THEN DELETE FROM lebihan_carry_over; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'resep_bikin')        THEN -- jangan dihapus, ini master data resep
    NULL; END IF;
END $$;

-- 7. Reset stok produk jadi ke 0
UPDATE produk_sku SET stok_saat_ini = 0 WHERE aktif = true;

-- 8. Reset stok bahan baku ke baseline
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Terigu';
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Minyak';
UPDATE bahan_baku SET stok_saat_ini = 25   WHERE nama = 'Garam';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Gula';
UPDATE bahan_baku SET stok_saat_ini = 190  WHERE nama = 'Air';
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

-- 9. Verifikasi — harus semua 0 kecuali stok bahan baku
SELECT 'batch_produksi'         AS tabel, COUNT(*) AS sisa FROM batch_produksi         UNION ALL
SELECT 'packing_input',                   COUNT(*) FROM packing_input                  UNION ALL
SELECT 'penggunaan_bahan',                COUNT(*) FROM penggunaan_bahan               UNION ALL
SELECT 'penerimaan_bahan_baku',           COUNT(*) FROM penerimaan_bahan_baku          UNION ALL
SELECT 'adjustment_bahan_baku',           COUNT(*) FROM adjustment_bahan_baku          UNION ALL
SELECT 'pengiriman',                      COUNT(*) FROM pengiriman;

SELECT nama, stok_saat_ini, satuan
FROM bahan_baku WHERE aktif = true ORDER BY nama;

SELECT brand, varian, isi_per_pack, stok_saat_ini
FROM produk_sku WHERE aktif = true ORDER BY brand, isi_per_pack, varian;

-- 10. Refresh schema PostgREST
NOTIFY pgrst, 'reload schema';
