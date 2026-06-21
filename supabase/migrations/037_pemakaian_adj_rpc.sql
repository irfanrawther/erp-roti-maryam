-- ============================================================
-- 037_pemakaian_adj_rpc.sql
-- Atomic adjustment untuk pemakaian bahan baku.
--
-- DESAIN STOK:
-- • proses_bikin  → baris ada di penerimaan_bahan_baku (tipe='keluar').
--   Trigger trg_penerimaan_bahan_update (migration 033) otomatis
--   menyesuaikan stok saat jumlah di-UPDATE.
--   → CUKUP UPDATE source row; TIDAK perlu INSERT kompensasi.
--
-- • produksi (adonan) → baris ada di penggunaan_bahan.
--   Tabel ini TIDAK punya trigger stok.
--   → UPDATE source row + INSERT kompensasi penerimaan_bahan_baku.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_pemakaian_adj(
  p_sumber          text,      -- 'proses_bikin' | 'produksi'
  p_source_id       uuid,
  p_expected_jumlah numeric,
  p_new_jumlah      numeric,
  p_bahan_baku_id   uuid,
  p_adj_jumlah      numeric,
  p_adj_satuan      text,
  p_adj_tipe        text,      -- 'sisa' | 'over'
  p_keterangan      text,
  p_user_id         uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current   numeric;
  v_tipe      text;
  v_tanggal   date := CURRENT_DATE AT TIME ZONE 'Asia/Jakarta';
BEGIN
  -- 1. Row lock + baca nilai saat ini
  IF p_sumber = 'proses_bikin' THEN
    SELECT jumlah INTO v_current
      FROM penerimaan_bahan_baku WHERE id = p_source_id FOR UPDATE;
  ELSE
    SELECT jumlah_digunakan INTO v_current
      FROM penggunaan_bahan WHERE id = p_source_id FOR UPDATE;
  END IF;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND',
      'message', 'Entry tidak ditemukan di database.');
  END IF;

  -- 2. Staleness check
  IF ABS(v_current - p_expected_jumlah) > 0.0001 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE',
      'message', format(
        'Data sudah berubah sejak form dibuka (DB: %s, form: %s). Tutup dan buka ulang form.',
        v_current, p_expected_jumlah),
      'current_jumlah', v_current);
  END IF;

  -- 3. Update source row + sesuaikan stok
  IF p_sumber = 'proses_bikin' THEN
    -- Trigger trg_penerimaan_bahan_update (migration 033) otomatis
    -- menghitung delta stok dari (old.jumlah → new.jumlah).
    -- JANGAN insert kompensasi — itu akan double-count.
    UPDATE penerimaan_bahan_baku
      SET jumlah = p_new_jumlah
    WHERE id = p_source_id;

  ELSE
    -- penggunaan_bahan tidak punya trigger stok;
    -- UPDATE tampilan saja, lalu insert kompensasi penerimaan.
    UPDATE penggunaan_bahan
      SET jumlah_digunakan = p_new_jumlah
    WHERE id = p_source_id;

    v_tipe := CASE WHEN p_adj_tipe = 'sisa' THEN 'masuk' ELSE 'keluar' END;
    INSERT INTO penerimaan_bahan_baku
      (bahan_baku_id, jumlah, satuan, tipe, tanggal, keterangan, created_by)
    VALUES
      (p_bahan_baku_id, p_adj_jumlah, p_adj_satuan, v_tipe, v_tanggal, p_keterangan, p_user_id);
  END IF;

  -- audit trail dilakukan di frontend (RLS context client)
  RETURN jsonb_build_object('ok', true, 'new_jumlah', p_new_jumlah, 'prev_jumlah', v_current);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'code', 'ERROR', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_pemakaian_adj TO authenticated, anon;
