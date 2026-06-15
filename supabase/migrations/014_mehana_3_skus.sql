-- ============================================================
-- 014_mehana_3_skus.sql
-- Buat 3 SKU kanonik Mehana (satu per varian) + resep adonan
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Buat 3 SKU kanonik Mehana
INSERT INTO produk_sku (brand, nama_brand, varian, isi_per_pack, kode_sku, aktif)
VALUES
  ('mehana', 'Mehana Boga Utama', 'Original', 45, 'MEHANA-ORIG',    true),
  ('mehana', 'Mehana Boga Utama', 'Cokelat',  45, 'MEHANA-COKELAT', true),
  ('mehana', 'Mehana Boga Utama', 'Keju',     45, 'MEHANA-KEJU',    true)
ON CONFLICT (kode_sku) DO UPDATE
  SET varian = EXCLUDED.varian,
      isi_per_pack = EXCLUDED.isi_per_pack,
      aktif = true;

-- 2. Nonaktifkan SKU Mehana lama (MBU-ORG-5, MBU-ORG-10, dll)
UPDATE produk_sku
SET aktif = false
WHERE brand = 'mehana'
  AND kode_sku NOT IN ('MEHANA-ORIG', 'MEHANA-COKELAT', 'MEHANA-KEJU');

-- 3. Hapus resep lama Mehana (jika ada)
DELETE FROM master_resep
WHERE produk_sku_id IN (
  SELECT id FROM produk_sku WHERE brand = 'mehana'
);

-- 4. Insert resep Mehana per 1 kg adonan
--    (semua varian pakai resep adonan dasar yang sama)
DO $$
DECLARE
  sku_orig    UUID;
  sku_cokelat UUID;
  sku_keju    UUID;
  admin_id    UUID;
  b_terigu    UUID;
  b_garam     UUID;
  b_gula      UUID;
  b_air       UUID;
  b_minyak_r  UUID;
  b_minyak_rd UUID;
BEGIN
  SELECT id INTO sku_orig    FROM produk_sku WHERE kode_sku = 'MEHANA-ORIG';
  SELECT id INTO sku_cokelat FROM produk_sku WHERE kode_sku = 'MEHANA-COKELAT';
  SELECT id INTO sku_keju    FROM produk_sku WHERE kode_sku = 'MEHANA-KEJU';
  SELECT id INTO admin_id    FROM users LIMIT 1;

  SELECT id INTO b_terigu    FROM bahan_baku WHERE nama = 'Terigu'        AND aktif = true LIMIT 1;
  SELECT id INTO b_garam     FROM bahan_baku WHERE nama = 'Garam'         AND aktif = true LIMIT 1;
  SELECT id INTO b_gula      FROM bahan_baku WHERE nama = 'Gula'          AND aktif = true LIMIT 1;
  SELECT id INTO b_air       FROM bahan_baku WHERE nama = 'Air'           AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_r  FROM bahan_baku WHERE nama = 'Minyak Resep'  AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_rd FROM bahan_baku WHERE nama = 'Minyak Rendam' AND aktif = true LIMIT 1;

  -- ── Original ──────────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_orig, b_terigu,    1,    'Kg',  admin_id),
    (sku_orig, b_garam,     17.5, 'gr',  admin_id),
    (sku_orig, b_gula,      20,   'gr',  admin_id),
    (sku_orig, b_air,       500,  'ml',  admin_id),
    (sku_orig, b_minyak_r,  50,   'ml',  admin_id),
    (sku_orig, b_minyak_rd, 100,  'ml',  admin_id);

  -- ── Cokelat ───────────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_cokelat, b_terigu,    1,    'Kg',  admin_id),
    (sku_cokelat, b_garam,     17.5, 'gr',  admin_id),
    (sku_cokelat, b_gula,      20,   'gr',  admin_id),
    (sku_cokelat, b_air,       500,  'ml',  admin_id),
    (sku_cokelat, b_minyak_r,  50,   'ml',  admin_id),
    (sku_cokelat, b_minyak_rd, 100,  'ml',  admin_id);

  -- ── Keju ──────────────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_keju, b_terigu,    1,    'Kg',  admin_id),
    (sku_keju, b_garam,     17.5, 'gr',  admin_id),
    (sku_keju, b_gula,      20,   'gr',  admin_id),
    (sku_keju, b_air,       500,  'ml',  admin_id),
    (sku_keju, b_minyak_r,  50,   'ml',  admin_id),
    (sku_keju, b_minyak_rd, 100,  'ml',  admin_id);

END $$;

-- 5. Verifikasi
SELECT ps.varian, bb.nama, mr.jumlah_per_pack, mr.satuan
FROM master_resep mr
JOIN produk_sku  ps ON ps.id = mr.produk_sku_id
JOIN bahan_baku  bb ON bb.id = mr.bahan_baku_id
WHERE ps.brand = 'mehana' AND ps.aktif = true
ORDER BY ps.varian, bb.nama;
