-- ============================================================
-- 020_reset_stok_awal.sql
-- Reset stok awal 15 bahan baku ke nilai default
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Pastikan hanya 15 bahan yang aktif, nonaktifkan sisanya
UPDATE bahan_baku SET aktif = false
WHERE nama NOT IN (
  'Terigu','Minyak','Garam','Gula','Air',
  'Margarine Menara','Mesis Innova','Keju Calf',
  'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
  'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
);

-- 2. Aktifkan & pastikan satuan benar
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Terigu';
UPDATE bahan_baku SET aktif = true, satuan = 'Liter' WHERE nama = 'Minyak';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Garam';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Gula';
UPDATE bahan_baku SET aktif = true, satuan = 'Liter' WHERE nama = 'Air';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET aktif = true, satuan = 'Pcs'   WHERE nama = 'Telur';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET aktif = true, satuan = 'Kg'    WHERE nama = 'Butter Hollmann';

-- 3. Reset stok langsung (bypass trigger — ini penetapan stok awal, bukan transaksi)
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Terigu';
UPDATE bahan_baku SET stok_saat_ini = 500  WHERE nama = 'Minyak';
UPDATE bahan_baku SET stok_saat_ini = 25   WHERE nama = 'Garam';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Gula';
UPDATE bahan_baku SET stok_saat_ini = 190  WHERE nama = 'Air';
UPDATE bahan_baku SET stok_saat_ini = 100  WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET stok_saat_ini = 100  WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET stok_saat_ini = 32   WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET stok_saat_ini = 50   WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET stok_saat_ini = 16   WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET stok_saat_ini = 1    WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET stok_saat_ini = 225  WHERE nama = 'Telur';
UPDATE bahan_baku SET stok_saat_ini = 5    WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET stok_saat_ini = 1    WHERE nama = 'Butter Hollmann';

-- 4. Verifikasi — harus tepat 15 baris
SELECT nama, satuan, stok_saat_ini
FROM bahan_baku
WHERE aktif = true
ORDER BY CASE nama
  WHEN 'Terigu'              THEN 1
  WHEN 'Minyak'              THEN 2
  WHEN 'Garam'               THEN 3
  WHEN 'Gula'                THEN 4
  WHEN 'Air'                 THEN 5
  WHEN 'Margarine Menara'    THEN 6
  WHEN 'Mesis Innova'        THEN 7
  WHEN 'Keju Calf'           THEN 8
  WHEN 'Margarine Blue Band' THEN 9
  WHEN 'Mesis Tulip'         THEN 10
  WHEN 'Keju Kraft Martabak' THEN 11
  WHEN 'Baking Powder'       THEN 12
  WHEN 'Telur'               THEN 13
  WHEN 'Tepung Gandum'       THEN 14
  WHEN 'Butter Hollmann'     THEN 15
  ELSE 99
END;
