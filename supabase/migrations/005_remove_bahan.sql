-- Jalankan di Supabase SQL Editor
-- Menghapus bahan: Mesis Tulip, Keju Kraft, Hollmann (Cane) + Mesis Innova, Keju Calf (Mehana)

DO $$
DECLARE
  ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO ids
  FROM bahan_baku
  WHERE nama IN ('Mesis Tulip','Keju Kraft','Hollmann','Mesis Innova','Keju Calf');

  -- Hapus dari master_resep
  DELETE FROM master_resep      WHERE bahan_baku_id = ANY(ids);
  -- Hapus dari penggunaan_bahan
  DELETE FROM penggunaan_bahan  WHERE bahan_baku_id = ANY(ids);
  -- Hapus dari penerimaan
  DELETE FROM penerimaan_bahan_baku WHERE bahan_baku_id = ANY(ids);
  -- Nonaktifkan bahan
  UPDATE bahan_baku SET aktif = false WHERE id = ANY(ids);
END $$;

-- Verifikasi
SELECT nama, aktif FROM bahan_baku
WHERE nama IN ('Mesis Tulip','Keju Kraft','Hollmann','Mesis Innova','Keju Calf');
