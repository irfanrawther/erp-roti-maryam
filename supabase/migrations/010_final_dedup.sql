-- Hapus duplikat — simpan row dengan id terkecil per nama
DELETE FROM bahan_baku
WHERE id NOT IN (
  SELECT MIN(id) FROM bahan_baku GROUP BY nama
);

-- Nonaktifkan bahan di luar daftar resmi
UPDATE bahan_baku SET aktif = false
WHERE nama NOT IN (
  'Terigu','Minyak','Garam','Gula','Air',
  'Margarine Menara','Mesis Innova','Keju Calf',
  'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
  'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
);

-- Aktifkan semua bahan resmi (kalau ada yang ter-nonaktifkan)
UPDATE bahan_baku SET aktif = true
WHERE nama IN (
  'Terigu','Minyak','Garam','Gula','Air',
  'Margarine Menara','Mesis Innova','Keju Calf',
  'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
  'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
);

-- Update stok minimum
UPDATE bahan_baku SET stok_minimum = 300 WHERE nama = 'Terigu';
UPDATE bahan_baku SET stok_minimum = 60  WHERE nama = 'Minyak';
UPDATE bahan_baku SET stok_minimum = 15  WHERE nama = 'Garam';
UPDATE bahan_baku SET stok_minimum = 15  WHERE nama = 'Gula';
UPDATE bahan_baku SET stok_minimum = 38  WHERE nama = 'Air';
UPDATE bahan_baku SET stok_minimum = 75  WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET stok_minimum = 100 WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET stok_minimum = 16  WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET stok_minimum = 30  WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET stok_minimum = 10  WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET stok_minimum = 8   WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET stok_minimum = 2   WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET stok_minimum = 100 WHERE nama = 'Telur';
UPDATE bahan_baku SET stok_minimum = 5   WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET stok_minimum = 1   WHERE nama = 'Butter Hollmann';

-- Verifikasi: harus tampil tepat 15 row aktif, masing-masing unik
SELECT nama, satuan, stok_minimum, stok_saat_ini, aktif
FROM bahan_baku WHERE aktif = true ORDER BY nama;
