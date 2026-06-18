-- ============================================================
-- 033_adjustment_bahan_baku.sql
-- Fitur Adjustment/Rekonsiliasi Bahan Baku.
--
-- Perubahan:
--   1. Tabel adjustment_bahan_baku — mencatat tiap adjustment
--   2. UPDATE trigger pada penerimaan_bahan_baku — sinkronisasi
--      stok_saat_ini saat jumlah baris di-edit (untuk undo/adjustment)
--
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- 1. Tabel adjustment_bahan_baku
CREATE TABLE IF NOT EXISTS adjustment_bahan_baku (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bahan_baku_id    UUID        NOT NULL REFERENCES bahan_baku(id),
  tipe             TEXT        NOT NULL CHECK (tipe IN ('sisa', 'over')),
  jumlah_adjustment NUMERIC    NOT NULL CHECK (jumlah_adjustment > 0),
  satuan           TEXT        NOT NULL,
  catatan          TEXT,
  -- snapshot jumlah asli sebelum di-edit (untuk undo)
  jumlah_sebelum   NUMERIC     NOT NULL,
  -- FK ke baris penerimaan_bahan_baku yang diedit
  riwayat_id       UUID        REFERENCES penerimaan_bahan_baku(id),
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: izinkan semua authenticated user
ALTER TABLE adjustment_bahan_baku ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'adjustment_bahan_baku' AND policyname = 'adj_auth_all'
  ) THEN
    CREATE POLICY adj_auth_all ON adjustment_bahan_baku
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Fungsi UPDATE trigger — hitung delta stok saat jumlah/tipe berubah
CREATE OR REPLACE FUNCTION fn_penerimaan_bahan_on_update()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC := 0;
BEGIN
  -- Reverse efek baris lama
  IF OLD.tipe = 'masuk'  THEN delta := delta - OLD.jumlah; END IF;
  IF OLD.tipe = 'keluar' THEN delta := delta + OLD.jumlah; END IF;
  -- Terapkan efek baris baru
  IF NEW.tipe = 'masuk'  THEN delta := delta + NEW.jumlah; END IF;
  IF NEW.tipe = 'keluar' THEN delta := delta - NEW.jumlah; END IF;

  -- Jaga stok tidak negatif
  UPDATE bahan_baku
    SET stok_saat_ini = GREATEST(0, stok_saat_ini + delta),
        updated_at    = NOW()
  WHERE id = NEW.bahan_baku_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Pasang trigger UPDATE (drop dulu supaya idempotent)
DROP TRIGGER IF EXISTS trg_penerimaan_bahan_update ON penerimaan_bahan_baku;
CREATE TRIGGER trg_penerimaan_bahan_update
  BEFORE UPDATE ON penerimaan_bahan_baku
  FOR EACH ROW EXECUTE FUNCTION fn_penerimaan_bahan_on_update();

-- 4. Verifikasi trigger terpasang
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'penerimaan_bahan_baku'
ORDER BY trigger_name;
