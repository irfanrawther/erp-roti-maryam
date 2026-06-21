-- ============================================================
-- 035_reject_types.sql
-- Split reject menjadi 2 tipe:
--   1. reject       = reject saat packing (cacat/rusak)
--   2. reject_lain  = basi/hilang/salah resep/dll
-- ============================================================

-- packing_input
ALTER TABLE packing_input
  ADD COLUMN IF NOT EXISTS reject_lain       INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alasan_reject_lain TEXT;   -- basi | hilang | salah_resep | lainnya

-- batch_produksi
ALTER TABLE batch_produksi
  ADD COLUMN IF NOT EXISTS jumlah_reject_lain INT NOT NULL DEFAULT 0;

-- Verifikasi
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('packing_input', 'batch_produksi')
  AND column_name LIKE '%reject%'
ORDER BY table_name, column_name;
