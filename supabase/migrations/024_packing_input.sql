-- ============================================================
-- 024_packing_input.sql
-- Tabel Input Stok (Packing & Freezer): pack5/pack10/reject/lebihan
-- + carry-over lebihan antar hari + tracking reject.
-- Jalankan di Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS packing_input (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_produksi_id uuid REFERENCES batch_produksi(id) ON DELETE SET NULL,
  produk_sku_id     uuid REFERENCES produk_sku(id),
  brand             text NOT NULL,            -- 'cane' | 'mehana'
  varian            text NOT NULL,            -- varianDB (Original, Cokelat, ...)
  tanggal           date NOT NULL DEFAULT CURRENT_DATE,
  total_direndam    integer NOT NULL DEFAULT 0,
  carry_in          integer NOT NULL DEFAULT 0,   -- lebihan carry-over dari sebelumnya
  total_available   integer NOT NULL DEFAULT 0,   -- direndam + carry_in
  pack5             integer NOT NULL DEFAULT 0,    -- jumlah pack isi 5
  pack10            integer NOT NULL DEFAULT 0,    -- jumlah pack isi 10
  reject            integer NOT NULL DEFAULT 0,    -- pcs reject
  lebihan           integer NOT NULL DEFAULT 0,    -- pcs lebihan (carry-out untuk besok)
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

-- Lookup carry-over (lebihan terakhir per brand+varian) & laporan reject
CREATE INDEX IF NOT EXISTS idx_packing_input_brand_varian ON packing_input (brand, varian, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packing_input_tanggal      ON packing_input (tanggal);

-- RLS — sama pola dengan tabel lain (auth dikelola di aplikasi via PIN)
ALTER TABLE packing_input ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON packing_input;
CREATE POLICY "allow_all" ON packing_input FOR ALL TO anon USING (true) WITH CHECK (true);

-- Verifikasi
SELECT 'packing_input siap' AS info, COUNT(*) AS baris FROM packing_input;
