-- ============================================================
-- 027_resep_bikin.sql
-- Tabel resep bahan untuk proses bikin (rendam) per pcs
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS resep_bikin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produk_sku_id UUID NOT NULL REFERENCES produk_sku(id),
  bahan_baku_id UUID NOT NULL REFERENCES bahan_baku(id),
  jumlah_per_pcs NUMERIC(10,5) NOT NULL,  -- gram per pcs
  satuan TEXT NOT NULL DEFAULT 'gr',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produk_sku_id, bahan_baku_id)
);

-- Grant permissions untuk anon key
GRANT SELECT, INSERT, UPDATE, DELETE ON resep_bikin TO anon;

-- Trigger updated_at (fungsi update_updated_at sudah ada dari 001)
CREATE TRIGGER trg_resep_bikin_updated_at
BEFORE UPDATE ON resep_bikin
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verifikasi
SELECT 'resep_bikin created' AS status;
