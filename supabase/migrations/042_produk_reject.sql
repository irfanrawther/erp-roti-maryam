-- ============================================================
-- 042_produk_reject.sql
-- Stok Produk Reject (hasil "reject packing") + penjualan ke
-- Olmoz Store + integrasi Stock Opname.
--
-- Konsep:
--   * Stok reject disimpan dalam satuan PCS, per (brand, varian).
--   * Sumber stok = field `reject` (reject packing) di packing_input
--     (di-handle di app level saat Input Stok).
--   * Penjualan reject selalu ke "Olmoz Store", diinput dalam PACK,
--     dikonversi ke pcs: Cane = 2 pcs/pack, Mehana = 5 pcs/pack.
-- ============================================================

-- 1. Tabel stok produk reject (pcs per brand+varian)
CREATE TABLE IF NOT EXISTS stok_produk_reject (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  brand       text        NOT NULL CHECK (brand IN ('cane','mehana')),
  varian      text        NOT NULL,
  pcs_per_pack int         NOT NULL,              -- cane 2, mehana 5
  stok_pcs    int         NOT NULL DEFAULT 0,
  aktif       boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(brand, varian)
);

-- Seed 7 varian (Cane 4 + Mehana 3)
INSERT INTO stok_produk_reject (brand, varian, pcs_per_pack) VALUES
  ('cane',   'Original',      2),
  ('cane',   'Melted Choco',  2),
  ('cane',   'Grated Cheese', 2),
  ('cane',   'Whole Wheat',   2),
  ('mehana', 'Original',      5),
  ('mehana', 'Cokelat',       5),
  ('mehana', 'Keju',          5)
ON CONFLICT (brand, varian) DO NOTHING;

-- 2. Tabel penjualan reject (ke Olmoz Store)
CREATE TABLE IF NOT EXISTS penjualan_reject (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reject_id      uuid        REFERENCES stok_produk_reject(id) NOT NULL,
  brand          text        NOT NULL,
  varian         text        NOT NULL,
  jumlah_pack    int         NOT NULL,
  jumlah_pcs     int         NOT NULL,
  toko           text        NOT NULL DEFAULT 'Olmoz Store',
  tanggal_keluar date        NOT NULL DEFAULT CURRENT_DATE,
  keterangan     text,
  created_by     uuid        REFERENCES users(id),
  created_at     timestamptz DEFAULT now()
);

-- 3. Detail stock opname untuk produk reject
CREATE TABLE IF NOT EXISTS stock_opname_detail_reject (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  opname_id   uuid    REFERENCES stock_opname(id) ON DELETE CASCADE NOT NULL,
  reject_id   uuid    REFERENCES stok_produk_reject(id) NOT NULL,
  stok_sistem numeric NOT NULL,
  stok_fisik  numeric,
  UNIQUE(opname_id, reject_id)
);

-- 4. RLS
ALTER TABLE stok_produk_reject         ENABLE ROW LEVEL SECURITY;
ALTER TABLE penjualan_reject           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_detail_reject ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stok_reject_all"          ON stok_produk_reject;
DROP POLICY IF EXISTS "penjualan_reject_all"     ON penjualan_reject;
DROP POLICY IF EXISTS "opname_reject_all"        ON stock_opname_detail_reject;

CREATE POLICY "stok_reject_all"      ON stok_produk_reject         FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "penjualan_reject_all" ON penjualan_reject           FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "opname_reject_all"    ON stock_opname_detail_reject FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 5. Recreate approve_stock_opname — tambahkan adjust produk reject
DROP FUNCTION IF EXISTS approve_stock_opname(uuid, uuid, text);
CREATE OR REPLACE FUNCTION approve_stock_opname(
  p_opname_id uuid,
  p_admin_id  uuid,
  p_catatan   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opname        stock_opname%ROWTYPE;
  v_delta         numeric;
  v_satuan        text;
  v_tipe          text;
  v_periode_label text;
  r               RECORD;
BEGIN
  SELECT * INTO v_opname FROM stock_opname WHERE id = p_opname_id FOR UPDATE;

  IF v_opname.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opname tidak ditemukan.');
  END IF;
  IF v_opname.status != 'pending_approval' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opname bukan dalam status menunggu approval.');
  END IF;

  v_periode_label := to_char(to_date(v_opname.periode || '-01', 'YYYY-MM-DD'), 'TMMonth YYYY');

  -- Adjust bahan baku
  FOR r IN
    SELECT d.id AS detail_id, d.bahan_id, d.stok_fisik,
           bb.stok_saat_ini AS current_stok, bb.satuan
    FROM stock_opname_detail_bahan d
    JOIN bahan_baku bb ON bb.id = d.bahan_id
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    v_delta  := r.stok_fisik - r.current_stok;
    v_satuan := LOWER(r.satuan);
    IF ABS(v_delta) > 0.000001 THEN
      v_tipe := CASE WHEN v_delta > 0 THEN 'masuk' ELSE 'keluar' END;
      INSERT INTO penerimaan_bahan_baku
        (bahan_baku_id, jumlah, satuan, tipe, tanggal, keterangan, created_by)
      VALUES
        (r.bahan_id, ABS(v_delta), v_satuan, v_tipe, CURRENT_DATE,
         'Stock Opname ' || TRIM(v_periode_label), p_admin_id);
    END IF;
  END LOOP;

  -- Adjust produk jadi (langsung set)
  FOR r IN
    SELECT d.produk_id, d.stok_fisik
    FROM stock_opname_detail_produk d
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE produk_sku SET stok_saat_ini = r.stok_fisik, updated_at = NOW() WHERE id = r.produk_id;
  END LOOP;

  -- Adjust produk reject (langsung set, satuan pcs)
  FOR r IN
    SELECT d.reject_id, d.stok_fisik
    FROM stock_opname_detail_reject d
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE stok_produk_reject SET stok_pcs = r.stok_fisik, updated_at = NOW() WHERE id = r.reject_id;
  END LOOP;

  UPDATE stock_opname
     SET status = 'approved', approved_by = p_admin_id,
         approved_at = NOW(), catatan_approval = p_catatan
   WHERE id = p_opname_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_stock_opname TO authenticated, anon;

-- 6. Verifikasi
SELECT brand, varian, pcs_per_pack, stok_pcs FROM stok_produk_reject ORDER BY brand, varian;
