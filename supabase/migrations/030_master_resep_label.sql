-- ============================================================
-- 030_master_resep_label.sql
-- Tambah kolom `label` ke master_resep agar bahan dengan nama
-- display berbeda (Minyak Resep / Minyak Rendam) bisa disimpan
-- sebagai 2 baris terpisah meski bahan_baku_id-nya sama.
-- Unique constraint diganti dari (produk_sku_id, bahan_baku_id)
-- menjadi (produk_sku_id, label).
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- 1. Tambah kolom label jika belum ada
ALTER TABLE master_resep ADD COLUMN IF NOT EXISTS label TEXT;

-- 2. Backfill: isi label dari nama bahan baku untuk baris yang sudah ada
UPDATE master_resep mr
SET label = bb.nama
FROM bahan_baku bb
WHERE mr.bahan_baku_id = bb.id AND mr.label IS NULL;

-- 3. Drop unique constraint lama
ALTER TABLE master_resep
  DROP CONSTRAINT IF EXISTS master_resep_produk_sku_id_bahan_baku_id_key;

-- 4. Tambah unique constraint baru berdasarkan label
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'master_resep_produk_sku_id_label_key'
  ) THEN
    ALTER TABLE master_resep
      ADD CONSTRAINT master_resep_produk_sku_id_label_key
      UNIQUE (produk_sku_id, label);
  END IF;
END $$;

-- Verifikasi
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'master_resep' ORDER BY ordinal_position;
