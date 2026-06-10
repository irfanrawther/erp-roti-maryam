-- ============================================================
-- Hapus semua duplikat bahan baku
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Langkah 1: lihat semua duplikat sebelum dihapus
SELECT nama, COUNT(*) AS jumlah_row
FROM bahan_baku
GROUP BY nama
HAVING COUNT(*) > 1
ORDER BY nama;

-- Langkah 2: untuk setiap nama yang duplikat,
--   gabungkan stok ke row paling lama (created_at terkecil),
--   lalu hapus sisanya

DO $$
DECLARE
  nama_bahan TEXT;
  id_simpan  UUID;
  total_stok NUMERIC;
BEGIN
  -- Loop setiap nama yang punya lebih dari 1 row
  FOR nama_bahan IN
    SELECT nama FROM bahan_baku
    GROUP BY nama HAVING COUNT(*) > 1
  LOOP
    -- Row yang paling lama dibuat → yang disimpan
    SELECT id INTO id_simpan
    FROM bahan_baku
    WHERE nama = nama_bahan
    ORDER BY created_at ASC
    LIMIT 1;

    -- Jumlahkan stok dari semua row dengan nama ini
    SELECT COALESCE(SUM(stok_saat_ini), 0) INTO total_stok
    FROM bahan_baku
    WHERE nama = nama_bahan;

    -- Update row yang disimpan: aktif + stok gabungan
    UPDATE bahan_baku
    SET stok_saat_ini = total_stok,
        aktif         = true,
        updated_at    = NOW()
    WHERE id = id_simpan;

    -- Hapus semua row lain dengan nama yang sama
    DELETE FROM bahan_baku
    WHERE nama = nama_bahan
      AND id <> id_simpan;

    RAISE NOTICE 'Deduplikasi: % → simpan id %, stok gabungan %', nama_bahan, id_simpan, total_stok;
  END LOOP;
END $$;

-- Langkah 3: pastikan stok_minimum benar untuk semua bahan aktif
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

-- Langkah 4: nonaktifkan bahan lama yang tidak ada di daftar resmi
UPDATE bahan_baku SET aktif = false
WHERE nama NOT IN (
  'Terigu','Minyak','Garam','Gula','Air',
  'Margarine Menara','Mesis Innova','Keju Calf',
  'Margarine Blue Band','Mesis Tulip','Keju Kraft Martabak',
  'Baking Powder','Telur','Tepung Gandum','Butter Hollmann'
);

-- Verifikasi akhir: harus 1 row per nama, semua aktif
SELECT nama, satuan, stok_saat_ini, stok_minimum, aktif
FROM bahan_baku
WHERE aktif = true
ORDER BY nama;
