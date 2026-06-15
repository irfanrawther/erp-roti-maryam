-- ============================================================
-- 028_resep_bikin_per_kg.sql
-- Ganti kolom jumlah_per_pcs → jumlah_per_kg di resep_bikin
-- Input format: gr per kg standar adonan (bukan per pcs)
-- Jalankan di Supabase SQL Editor
-- ============================================================

ALTER TABLE resep_bikin
  RENAME COLUMN jumlah_per_pcs TO jumlah_per_kg;

-- Verifikasi
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resep_bikin'
ORDER BY ordinal_position;
