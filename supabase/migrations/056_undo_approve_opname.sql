-- ============================================================
-- 056_undo_approve_opname.sql
-- Undo Approve Stock Opname (Super Admin) — reverse stok changes
-- dari approve_stock_opname secara akurat, pakai snapshot "stok
-- sebelum approve" yang direkam saat approve dijalankan, lalu
-- kompensasi via DELTA (bukan overwrite) supaya pergerakan stok
-- lain sesudah approve tidak ikut ketimpa.
-- ============================================================

ALTER TABLE stock_opname_detail_bahan  ADD COLUMN IF NOT EXISTS stok_sebelum_approve numeric;
ALTER TABLE stock_opname_detail_produk ADD COLUMN IF NOT EXISTS stok_sebelum_approve numeric;
ALTER TABLE stock_opname_detail_reject ADD COLUMN IF NOT EXISTS stok_sebelum_approve numeric;

-- Rekam snapshot pre-approval saat approve dijalankan
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

  -- Adjust bahan baku (via ledger penerimaan_bahan_baku)
  FOR r IN
    SELECT d.id AS detail_id, d.bahan_id, d.stok_fisik,
           bb.stok_saat_ini AS current_stok, bb.satuan
    FROM stock_opname_detail_bahan d
    JOIN bahan_baku bb ON bb.id = d.bahan_id
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE stock_opname_detail_bahan SET stok_sebelum_approve = r.current_stok WHERE id = r.detail_id;
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

  -- Adjust produk jadi (langsung set, rekam snapshot sebelum)
  FOR r IN
    SELECT d.id AS detail_id, d.produk_id, d.stok_fisik, p.stok_saat_ini AS current_stok
    FROM stock_opname_detail_produk d
    JOIN produk_sku p ON p.id = d.produk_id
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE stock_opname_detail_produk SET stok_sebelum_approve = r.current_stok WHERE id = r.detail_id;
    UPDATE produk_sku SET stok_saat_ini = r.stok_fisik, updated_at = NOW() WHERE id = r.produk_id;
  END LOOP;

  -- Adjust produk reject (langsung set, satuan pcs, rekam snapshot sebelum)
  FOR r IN
    SELECT d.id AS detail_id, d.reject_id, d.stok_fisik, s.stok_pcs AS current_stok
    FROM stock_opname_detail_reject d
    JOIN stok_produk_reject s ON s.id = d.reject_id
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL
  LOOP
    UPDATE stock_opname_detail_reject SET stok_sebelum_approve = r.current_stok WHERE id = r.detail_id;
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

-- Undo: kompensasi via delta (stok_fisik - stok_sebelum_approve), bukan overwrite,
-- supaya pergerakan stok yang legit terjadi SETELAH approve tidak ikut hilang.
CREATE OR REPLACE FUNCTION undo_approve_stock_opname(
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
  v_tipe          text;
  v_periode_label text;
  r               RECORD;
BEGIN
  SELECT * INTO v_opname FROM stock_opname WHERE id = p_opname_id FOR UPDATE;

  IF v_opname.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opname tidak ditemukan.');
  END IF;
  IF v_opname.status != 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opname belum di-approve, tidak bisa di-undo.');
  END IF;

  v_periode_label := to_char(to_date(v_opname.periode || '-01', 'YYYY-MM-DD'), 'TMMonth YYYY');

  -- Undo bahan baku: insert entri ledger berlawanan sebesar delta yang tadi diterapkan
  FOR r IN
    SELECT d.bahan_id, d.stok_fisik, d.stok_sebelum_approve, bb.satuan
    FROM stock_opname_detail_bahan d
    JOIN bahan_baku bb ON bb.id = d.bahan_id
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL AND d.stok_sebelum_approve IS NOT NULL
  LOOP
    v_delta := r.stok_fisik - r.stok_sebelum_approve;
    IF ABS(v_delta) > 0.000001 THEN
      v_tipe := CASE WHEN v_delta > 0 THEN 'keluar' ELSE 'masuk' END; -- kebalikan dari approve
      INSERT INTO penerimaan_bahan_baku
        (bahan_baku_id, jumlah, satuan, tipe, tanggal, keterangan, created_by)
      VALUES
        (r.bahan_id, ABS(v_delta), LOWER(r.satuan), v_tipe, CURRENT_DATE,
         'Undo Stock Opname ' || TRIM(v_periode_label), p_admin_id);
    END IF;
  END LOOP;

  -- Undo produk jadi: kurangi delta yang tadi diterapkan
  FOR r IN
    SELECT d.produk_id, d.stok_fisik, d.stok_sebelum_approve
    FROM stock_opname_detail_produk d
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL AND d.stok_sebelum_approve IS NOT NULL
  LOOP
    UPDATE produk_sku
       SET stok_saat_ini = GREATEST(0, stok_saat_ini - (r.stok_fisik - r.stok_sebelum_approve)),
           updated_at = NOW()
     WHERE id = r.produk_id;
  END LOOP;

  -- Undo produk reject: kurangi delta yang tadi diterapkan
  FOR r IN
    SELECT d.reject_id, d.stok_fisik, d.stok_sebelum_approve
    FROM stock_opname_detail_reject d
    WHERE d.opname_id = p_opname_id AND d.stok_fisik IS NOT NULL AND d.stok_sebelum_approve IS NOT NULL
  LOOP
    UPDATE stok_produk_reject
       SET stok_pcs = GREATEST(0, stok_pcs - (r.stok_fisik - r.stok_sebelum_approve)),
           updated_at = NOW()
     WHERE id = r.reject_id;
  END LOOP;

  -- Balik status ke pending_approval supaya bisa dikoreksi & di-approve ulang
  UPDATE stock_opname
     SET status = 'pending_approval',
         approved_by = NULL, approved_at = NULL,
         catatan_approval = COALESCE(p_catatan, catatan_approval)
   WHERE id = p_opname_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION undo_approve_stock_opname TO authenticated, anon;

SELECT 'undo_approve_stock_opname created' AS info;
