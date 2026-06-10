-- ============================================================
-- Jalankan seluruh file ini di Supabase SQL Editor
-- ============================================================

-- 1. Tambah kolom tipe ke penerimaan_bahan_baku
ALTER TABLE penerimaan_bahan_baku
  ADD COLUMN IF NOT EXISTS tipe TEXT NOT NULL DEFAULT 'masuk'
  CHECK (tipe IN ('masuk', 'keluar'));

-- 2. Perbarui trigger stok agar menangani masuk & keluar
CREATE OR REPLACE FUNCTION update_stok_bahan_masuk()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipe = 'masuk' THEN
    UPDATE bahan_baku
    SET stok_saat_ini = stok_saat_ini + NEW.jumlah, updated_at = NOW()
    WHERE id = NEW.bahan_baku_id;
  ELSE
    UPDATE bahan_baku
    SET stok_saat_ini = GREATEST(0, stok_saat_ini - NEW.jumlah), updated_at = NOW()
    WHERE id = NEW.bahan_baku_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Nonaktifkan semua bahan lama
UPDATE bahan_baku SET aktif = false;

-- 4. Insert bahan baru (skip jika sudah ada berdasarkan nama)
INSERT INTO bahan_baku (nama, satuan, stok_minimum, brand, aktif) VALUES
  ('Terigu',              'Kg',    300, 'both',   true),
  ('Minyak',              'Liter',  60, 'both',   true),
  ('Garam',               'Kg',     15, 'both',   true),
  ('Gula',                'Kg',     15, 'both',   true),
  ('Air',                 'Liter',  38, 'both',   true),
  ('Margarine Menara',    'Kg',     75, 'mehana', true),
  ('Mesis Innova',        'Kg',    100, 'mehana', true),
  ('Keju Calf',           'Kg',     16, 'mehana', true),
  ('Margarine Blue Band', 'Kg',     30, 'cane',   true),
  ('Mesis Tulip',         'Kg',     10, 'cane',   true),
  ('Keju Kraft Martabak', 'Kg',      8, 'cane',   true),
  ('Baking Powder',       'Kg',      2, 'cane',   true),
  ('Telur',               'Pcs',   100, 'cane',   true),
  ('Tepung Gandum',       'Kg',      5, 'cane',   true),
  ('Butter Hollmann',     'Kg',      1, 'cane',   true)
ON CONFLICT DO NOTHING;

-- Jika bahan sudah ada tapi nonaktif, aktifkan dan update minimum
UPDATE bahan_baku SET aktif = true, stok_minimum = 300 WHERE nama = 'Terigu';
UPDATE bahan_baku SET aktif = true, stok_minimum = 60  WHERE nama = 'Minyak';
UPDATE bahan_baku SET aktif = true, stok_minimum = 15  WHERE nama = 'Garam';
UPDATE bahan_baku SET aktif = true, stok_minimum = 15  WHERE nama = 'Gula';
UPDATE bahan_baku SET aktif = true, stok_minimum = 38  WHERE nama = 'Air';
UPDATE bahan_baku SET aktif = true, stok_minimum = 75  WHERE nama = 'Margarine Menara';
UPDATE bahan_baku SET aktif = true, stok_minimum = 100 WHERE nama = 'Mesis Innova';
UPDATE bahan_baku SET aktif = true, stok_minimum = 16  WHERE nama = 'Keju Calf';
UPDATE bahan_baku SET aktif = true, stok_minimum = 30  WHERE nama = 'Margarine Blue Band';
UPDATE bahan_baku SET aktif = true, stok_minimum = 10  WHERE nama = 'Mesis Tulip';
UPDATE bahan_baku SET aktif = true, stok_minimum = 8   WHERE nama = 'Keju Kraft Martabak';
UPDATE bahan_baku SET aktif = true, stok_minimum = 2   WHERE nama = 'Baking Powder';
UPDATE bahan_baku SET aktif = true, stok_minimum = 100 WHERE nama = 'Telur';
UPDATE bahan_baku SET aktif = true, stok_minimum = 5   WHERE nama = 'Tepung Gandum';
UPDATE bahan_baku SET aktif = true, stok_minimum = 1   WHERE nama = 'Butter Hollmann';

-- 5. Grant permission kolom baru ke anon
GRANT SELECT, INSERT, UPDATE, DELETE ON penerimaan_bahan_baku TO anon;

-- Verifikasi
SELECT nama, satuan, stok_minimum, aktif FROM bahan_baku WHERE aktif = true ORDER BY nama;
