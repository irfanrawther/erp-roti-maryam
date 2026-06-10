-- Hapus duplikat Air — simpan 1 row saja (yang stok_minimum = 38)
-- Langkah 1: lihat semua row Air
SELECT id, nama, satuan, stok_minimum, stok_saat_ini, aktif
FROM bahan_baku WHERE nama = 'Air' ORDER BY created_at;

-- Langkah 2: gabungkan stok ke row pertama (yang paling lama dibuat)
WITH rows AS (
  SELECT id, stok_saat_ini,
         ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM bahan_baku WHERE nama = 'Air'
),
total AS (SELECT SUM(stok_saat_ini) AS total_stok FROM bahan_baku WHERE nama = 'Air'),
keep AS (SELECT id FROM rows WHERE rn = 1)
UPDATE bahan_baku
SET stok_saat_ini = (SELECT total_stok FROM total),
    stok_minimum  = 38,
    satuan        = 'Liter',
    aktif         = true
WHERE id = (SELECT id FROM keep);

-- Langkah 3: hapus semua row Air kecuali yang paling lama
DELETE FROM bahan_baku
WHERE nama = 'Air'
  AND id NOT IN (
    SELECT id FROM bahan_baku
    WHERE nama = 'Air'
    ORDER BY created_at
    LIMIT 1
  );

-- Verifikasi: harus muncul 1 row saja
SELECT id, nama, satuan, stok_minimum, stok_saat_ini, aktif
FROM bahan_baku WHERE nama = 'Air';
