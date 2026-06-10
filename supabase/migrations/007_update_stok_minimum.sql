-- Jalankan di Supabase SQL Editor
-- Update batas minimum stok sesuai data terbaru

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

-- Verifikasi
SELECT nama, satuan, stok_minimum FROM bahan_baku
WHERE aktif = true
ORDER BY nama;
