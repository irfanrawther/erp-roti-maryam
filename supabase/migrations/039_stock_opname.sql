-- ============================================================
-- 039_stock_opname.sql
-- Stock Opname bulanan: tabel, seed PIC, RLS, RPC approve/reject
-- ============================================================

-- 1. Tabel utama stock opname
CREATE TABLE IF NOT EXISTS stock_opname (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  periode         text        NOT NULL,  -- 'YYYY-MM'
  pic_id          uuid        REFERENCES users(id) NOT NULL,
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','pending_approval','approved','rejected')),
  catatan_pic     text,
  catatan_approval text,
  approved_by     uuid        REFERENCES users(id),
  created_at      timestamptz DEFAULT now(),
  submitted_at    timestamptz,
  approved_at     timestamptz,
  UNIQUE(periode)
);

-- 2. Detail bahan baku
CREATE TABLE IF NOT EXISTS stock_opname_detail_bahan (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  opname_id   uuid    REFERENCES stock_opname(id) ON DELETE CASCADE NOT NULL,
  bahan_id    uuid    REFERENCES bahan_baku(id) NOT NULL,
  stok_sistem numeric NOT NULL,
  stok_fisik  numeric,
  UNIQUE(opname_id, bahan_id)
);

-- 3. Detail produk jadi
CREATE TABLE IF NOT EXISTS stock_opname_detail_produk (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  opname_id   uuid    REFERENCES stock_opname(id) ON DELETE CASCADE NOT NULL,
  produk_id   uuid    REFERENCES produk_sku(id) NOT NULL,
  stok_sistem numeric NOT NULL,
  stok_fisik  numeric,
  UNIQUE(opname_id, produk_id)
);

-- 4. Seed user PIC Stock Opname (PIN: 666666)
INSERT INTO users (nama, role, pin_hash, aktif)
VALUES (
  'PIC Stock Opname',
  'pic',
  encode(digest('666666', 'sha256'), 'hex'),
  true
)
ON CONFLICT DO NOTHING;

-- 5. RLS (semua role bisa baca; write dikontrol di app level)
ALTER TABLE stock_opname              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_detail_bahan ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_detail_produk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opname_all"         ON stock_opname;
DROP POLICY IF EXISTS "opname_bahan_all"   ON stock_opname_detail_bahan;
DROP POLICY IF EXISTS "opname_produk_all"  ON stock_opname_detail_produk;

CREATE POLICY "opname_all"        ON stock_opname              FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "opname_bahan_all"  ON stock_opname_detail_bahan FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "opname_produk_all" ON stock_opname_detail_produk FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 6. RPC: Approve opname
--    Menghitung delta dari stok SAAT INI (bukan stok_sistem snapshot)
--    dan insert penerimaan_bahan_baku untuk audit + trigger stok.
--    Produk jadi langsung di-SET ke stok_fisik.
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
  v_current_stok  numeric;
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

  -- Format "Juni 2026"
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
      -- trg_stok_masuk (INSERT trigger) otomatis sesuaikan stok_saat_ini
    END IF;
  END LOOP;

  -- Adjust produk jadi (langsung set, tidak ada trigger)
  FOR r IN
    SELECT d.produk_id, d.stok_fisik
    FROM stock_opname_detail_produk d
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE produk_sku
       SET stok_saat_ini = r.stok_fisik, updated_at = NOW()
     WHERE id = r.produk_id;
  END LOOP;

  -- Mark approved
  UPDATE stock_opname
     SET status       = 'approved',
         approved_by  = p_admin_id,
         approved_at  = NOW(),
         catatan_approval = p_catatan
   WHERE id = p_opname_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_stock_opname TO authenticated, anon;

-- 7. RPC: Reject opname (kembalikan ke draft)
DROP FUNCTION IF EXISTS reject_stock_opname(uuid, uuid, text);
CREATE OR REPLACE FUNCTION reject_stock_opname(
  p_opname_id uuid,
  p_admin_id  uuid,
  p_catatan   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE stock_opname
     SET status           = 'rejected',
         catatan_approval = p_catatan
   WHERE id = p_opname_id AND status = 'pending_approval';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opname tidak ditemukan atau tidak dalam status menunggu approval.');
  END IF;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_stock_opname TO authenticated, anon;

-- 8. Verifikasi
SELECT 'stock_opname tables created' AS info;
SELECT id, nama, role FROM users WHERE role = 'pic';
