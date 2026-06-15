-- ============================================================
-- 019_cleanup_bahan_baku.sql
-- Hapus fisik bahan baku di luar list + set stok awal 15 bahan
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Daftar nama yang DIPERTAHANKAN
-- 'Terigu','Minyak','Garam','Gula','Air',
-- 'Margarine Menara','Mesis Innova','Keju Calf',
-- 'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
-- 'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'

-- 1. Hapus referensi di master_resep untuk bahan yang akan dihapus
DELETE FROM master_resep
WHERE bahan_baku_id IN (
  SELECT id FROM bahan_baku
  WHERE nama NOT IN (
    'Terigu','Minyak','Garam','Gula','Air',
    'Margarine Menara','Mesis Innova','Keju Calf',
    'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
    'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
  )
);

-- 2. Hapus referensi di penggunaan_bahan untuk bahan yang akan dihapus
DELETE FROM penggunaan_bahan
WHERE bahan_baku_id IN (
  SELECT id FROM bahan_baku
  WHERE nama NOT IN (
    'Terigu','Minyak','Garam','Gula','Air',
    'Margarine Menara','Mesis Innova','Keju Calf',
    'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
    'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
  )
);

-- 3. Hapus referensi di penerimaan_bahan_baku untuk bahan yang akan dihapus
DELETE FROM penerimaan_bahan_baku
WHERE bahan_baku_id IN (
  SELECT id FROM bahan_baku
  WHERE nama NOT IN (
    'Terigu','Minyak','Garam','Gula','Air',
    'Margarine Menara','Mesis Innova','Keju Calf',
    'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
    'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
  )
);

-- 4. Hapus fisik bahan baku yang tidak ada di list
DELETE FROM bahan_baku
WHERE nama NOT IN (
  'Terigu','Minyak','Garam','Gula','Air',
  'Margarine Menara','Mesis Innova','Keju Calf',
  'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
  'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
);

-- 5. Aktifkan & pastikan satuan benar
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

-- 6. Set stok awal (langsung ke kolom, tidak lewat trigger)
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

-- 7. Verifikasi akhir — harus tepat 15 baris
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
