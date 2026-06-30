-- ============================================================
-- 048_minyak_kg.sql
-- Ubah satuan MINYAK dari liter/ml → kg/gram. Patokan: 1 L = 0.9 kg.
-- HANYA minyak. Bahan lain tidak tersentuh.
-- ============================================================

-- 1) Stok bahan baku Minyak: liter → kg (×0.9), mis. 500 L → 450 kg
UPDATE bahan_baku
SET stok_saat_ini = stok_saat_ini * 0.9, satuan = 'kg', updated_at = now()
WHERE nama = 'Minyak' AND lower(satuan) IN ('liter', 'l', 'ml');

-- 2) Resep Adonan (master_resep) — Minyak Resep 50 ml → 45 gr, Minyak Rendam 100 ml → 90 gr
UPDATE master_resep mr
SET jumlah_per_pack = mr.jumlah_per_pack * 0.9, satuan = 'gr'
FROM bahan_baku b
WHERE b.id = mr.bahan_baku_id AND b.nama = 'Minyak' AND lower(mr.satuan) IN ('ml', 'liter', 'l');

-- 3) Resep Bikin (resep_bikin) — jika minyak ada di sini
UPDATE resep_bikin rb
SET jumlah_per_kg = rb.jumlah_per_kg * 0.9, satuan = 'gr'
FROM bahan_baku b
WHERE b.id = rb.bahan_baku_id AND b.nama = 'Minyak' AND lower(rb.satuan) IN ('ml', 'liter', 'l');

-- 4) Riwayat transaksi minyak (penerimaan & penggunaan) → konsisten ke kg/gr
UPDATE penerimaan_bahan_baku p
SET jumlah = p.jumlah * 0.9, satuan = 'Kg'
FROM bahan_baku b
WHERE b.id = p.bahan_baku_id AND b.nama = 'Minyak' AND lower(p.satuan) IN ('liter', 'l');
UPDATE penerimaan_bahan_baku p
SET jumlah = p.jumlah * 0.9, satuan = 'gr'
FROM bahan_baku b
WHERE b.id = p.bahan_baku_id AND b.nama = 'Minyak' AND lower(p.satuan) = 'ml';

UPDATE penggunaan_bahan pg
SET jumlah_digunakan = pg.jumlah_digunakan * 0.9, satuan = 'Kg'
FROM bahan_baku b
WHERE b.id = pg.bahan_baku_id AND b.nama = 'Minyak' AND lower(pg.satuan) IN ('liter', 'l');
UPDATE penggunaan_bahan pg
SET jumlah_digunakan = pg.jumlah_digunakan * 0.9, satuan = 'gr'
FROM bahan_baku b
WHERE b.id = pg.bahan_baku_id AND b.nama = 'Minyak' AND lower(pg.satuan) = 'ml';

-- 5) Resync RPC: baseline Minyak 500 → 450
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
      ('Minyak',              450::numeric),   -- diubah dari 500 (liter) → 450 (kg)
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
    SELECT bb2.nama,
      SUM(CASE WHEN p.tipe = 'masuk' THEN p.jumlah ELSE -p.jumlah END) AS net
    FROM penerimaan_bahan_baku p
    JOIN bahan_baku bb2 ON bb2.id = p.bahan_baku_id
    GROUP BY bb2.nama
  ) AS tx ON tx.nama = baseline.nama
  WHERE b.nama = baseline.nama AND b.aktif = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION resync_stok_bahan TO authenticated, anon;

-- Verifikasi
SELECT nama, stok_saat_ini, satuan FROM bahan_baku WHERE nama = 'Minyak';
SELECT mr.label, mr.jumlah_per_pack, mr.satuan FROM master_resep mr
  JOIN bahan_baku b ON b.id = mr.bahan_baku_id WHERE b.nama = 'Minyak';
