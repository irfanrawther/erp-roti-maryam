-- Jalankan di Supabase SQL Editor
-- Menggabungkan "Margarine Blueband Ngadon" dan "Margarine Blue Band Oles"
-- menjadi satu bahan "Margarine Blue Band"

-- 1. Buat / upsert bahan baru
INSERT INTO bahan_baku (nama, satuan, brand, stok_minimum)
VALUES ('Margarine Blue Band', 'kg', 'cane', 5)
ON CONFLICT DO NOTHING;

-- 2. Simpan id bahan baru
DO $$
DECLARE
  id_baru       UUID;
  id_ngadon     UUID;
  id_oles       UUID;
BEGIN
  SELECT id INTO id_baru   FROM bahan_baku WHERE nama = 'Margarine Blue Band';
  SELECT id INTO id_ngadon FROM bahan_baku WHERE nama = 'Margarine Blueband Ngadon';
  SELECT id INTO id_oles   FROM bahan_baku WHERE nama = 'Margarine Blue Band Oles';

  -- 3. Pindahkan penerimaan bahan ke bahan baru
  UPDATE penerimaan_bahan_baku SET bahan_baku_id = id_baru WHERE bahan_baku_id = id_ngadon;
  UPDATE penerimaan_bahan_baku SET bahan_baku_id = id_baru WHERE bahan_baku_id = id_oles;

  -- 4. Pindahkan penggunaan bahan di produksi
  UPDATE penggunaan_bahan SET bahan_baku_id = id_baru WHERE bahan_baku_id = id_ngadon;
  UPDATE penggunaan_bahan SET bahan_baku_id = id_baru WHERE bahan_baku_id = id_oles;

  -- 5. Hapus entri master_resep lama yang pakai kedua bahan lama
  DELETE FROM master_resep WHERE bahan_baku_id IN (id_ngadon, id_oles);

  -- 6. Nonaktifkan (bukan hapus) bahan lama agar riwayat tetap konsisten
  UPDATE bahan_baku SET aktif = false WHERE id IN (id_ngadon, id_oles);
END $$;

-- 7. Verifikasi
SELECT id, nama, satuan, aktif, stok_saat_ini
FROM bahan_baku
WHERE nama ILIKE '%margarine%blue%'
ORDER BY aktif DESC, nama;
