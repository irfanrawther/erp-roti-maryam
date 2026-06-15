-- ============================================================
-- 022_reset_adonan_batches.sql
-- Bersihkan semua batch dengan status 'adonan' + restore stok
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Step 1: Restore stok bahan baku dari penggunaan_bahan milik batch adonan
INSERT INTO penerimaan_bahan_baku (bahan_baku_id, jumlah, satuan, tipe, tanggal, keterangan, created_by)
SELECT
  pb.bahan_baku_id,
  pb.jumlah_digunakan,
  pb.satuan,
  'masuk',
  CURRENT_DATE,
  'Reset test data: restore stok adonan batch #' || LEFT(bp.id::text, 8),
  bp.created_by
FROM penggunaan_bahan pb
JOIN batch_produksi bp ON pb.batch_produksi_id = bp.id
WHERE bp.status = 'adonan';

-- Step 2: Hapus penggunaan_bahan untuk batch adonan
DELETE FROM penggunaan_bahan
WHERE batch_produksi_id IN (
  SELECT id FROM batch_produksi WHERE status = 'adonan'
);

-- Step 3: Hapus batch adonan
DELETE FROM batch_produksi WHERE status = 'adonan';

-- Verifikasi
SELECT 'Sisa batch adonan:' AS info, COUNT(*) AS jumlah FROM batch_produksi WHERE status = 'adonan'
UNION ALL
SELECT 'Total stok terigu (Kg):', stok_saat_ini FROM bahan_baku WHERE nama = 'Terigu' LIMIT 1;
