-- ============================================================
-- 021_add_bikin_status.sql
-- Tambah status 'bikin' ke flow batch_produksi
-- Flow baru: adonan → bikin → packing → freezer → selesai
-- Jalankan di Supabase SQL Editor
-- ============================================================

ALTER TABLE batch_produksi
  DROP CONSTRAINT IF EXISTS batch_produksi_status_check;

ALTER TABLE batch_produksi
  ADD CONSTRAINT batch_produksi_status_check
  CHECK (status IN ('adonan', 'bikin', 'packing', 'freezer', 'selesai'));

-- Verifikasi
SELECT COUNT(*) AS total_batch, status
FROM batch_produksi
GROUP BY status
ORDER BY status;
