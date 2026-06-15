-- ============================================================
-- 029_resep_bikin_fix.sql
-- Pastikan tabel resep_bikin ada dan kolom benar (jumlah_per_kg)
-- Aman untuk dijalankan berulang kali (idempotent)
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Buat tabel jika belum ada (dengan kolom jumlah_per_kg langsung)
CREATE TABLE IF NOT EXISTS resep_bikin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produk_sku_id UUID NOT NULL REFERENCES produk_sku(id),
  bahan_baku_id UUID NOT NULL REFERENCES bahan_baku(id),
  jumlah_per_kg NUMERIC(10,5) NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'gr',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produk_sku_id, bahan_baku_id)
);

-- Rename kolom lama jika masih bernama jumlah_per_pcs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resep_bikin' AND column_name = 'jumlah_per_pcs'
  ) THEN
    ALTER TABLE resep_bikin RENAME COLUMN jumlah_per_pcs TO jumlah_per_kg;
  END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON resep_bikin TO anon;

-- Trigger updated_at (buat jika belum ada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_resep_bikin_updated_at'
  ) THEN
    CREATE TRIGGER trg_resep_bikin_updated_at
    BEFORE UPDATE ON resep_bikin
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- Verifikasi struktur tabel
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'resep_bikin'
ORDER BY ordinal_position;
