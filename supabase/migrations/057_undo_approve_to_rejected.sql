-- ============================================================
-- 057_undo_approve_to_rejected.sql
-- Ubah target undo_approve_stock_opname: kembali ke status
-- 'rejected' (bukan 'pending_approval') supaya opname otomatis
-- ter-unlock di tab Input Opname untuk PIC koreksi — data
-- stok_utuh/stok_sisa yang sudah ada TETAP tersimpan (tidak
-- direset), PIC tinggal perbaiki lalu submit ulang.
-- ============================================================

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

  -- Balik status ke 'rejected' (bukan pending_approval) supaya otomatis ter-unlock
  -- di tab Input Opname untuk PIC koreksi. Data stok_utuh/stok_sisa TIDAK direset.
  UPDATE stock_opname
     SET status = 'rejected',
         approved_by = NULL, approved_at = NULL,
         catatan_approval = COALESCE(p_catatan, 'Undo approve oleh Super Admin — dikembalikan untuk koreksi PIC.')
   WHERE id = p_opname_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION undo_approve_stock_opname TO authenticated, anon;

SELECT 'undo_approve_stock_opname now targets rejected status' AS info;
