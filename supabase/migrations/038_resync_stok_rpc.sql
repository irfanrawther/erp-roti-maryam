-- ============================================================
-- 038_resync_stok_rpc.sql
-- RPC untuk menghitung ulang stok_saat_ini dari nol berdasarkan
-- semua riwayat penerimaan_bahan_baku (masuk - keluar).
-- Formula: stok = STOK_AWAL + SUM(masuk) - SUM(keluar)
-- Dipakai oleh tombol "Sinkronkan Stok" (super admin only).
-- ============================================================

CREATE OR REPLACE FUNCTION resync_stok_bahan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  UPDATE bahan_baku b
  SET stok_saat_ini = GREATEST(0, baseline.stok_awal + COALESCE(tx.net, 0)),
      updated_at    = NOW()
  FROM (
    VALUES
      ('Terigu',              500::numeric),
      ('Minyak',              500::numeric),
      ('Garam',                25::numeric),
      ('Gula',                 50::numeric),
      ('Air',                 190::numeric),
      ('Margarine Menara',    100::numeric),
      ('Mesis Innova',        100::numeric),
      ('Keju Calf',            32::numeric),
      ('Margarine Blue Band',  50::numeric),
      ('Mesis Tulip',          50::numeric),
      ('Keju Kraft Martabak',  16::numeric),
      ('Baking Powder',         1::numeric),
      ('Telur',               225::numeric),
      ('Tepung Gandum',         5::numeric),
      ('Butter Hollmann',       1::numeric)
  ) AS baseline(nama, stok_awal)
  LEFT JOIN (
    -- Join ke bahan_baku di dalam subquery agar tidak ada forward ref ke b
    SELECT
      bb2.nama,
      SUM(CASE WHEN p.tipe = 'masuk' THEN p.jumlah ELSE -p.jumlah END) AS net
    FROM penerimaan_bahan_baku p
    JOIN bahan_baku bb2 ON bb2.id = p.bahan_baku_id
    GROUP BY bb2.nama
  ) AS tx ON tx.nama = baseline.nama
  WHERE b.nama = baseline.nama
    AND b.aktif = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_updated);

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION resync_stok_bahan TO authenticated, anon;
