-- ============================================================
-- 012_update_resep_cane.sql
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Tambah Minyak Resep & Minyak Rendam ke bahan_baku (jika belum ada)
INSERT INTO bahan_baku (nama, satuan, stok_minimum, brand, aktif)
VALUES
  ('Minyak Resep',  'Liter', 5,  'cane', true),
  ('Minyak Rendam', 'Liter', 10, 'cane', true)
ON CONFLICT DO NOTHING;

-- Aktifkan jika sudah ada tapi nonaktif
UPDATE bahan_baku SET aktif = true WHERE nama IN ('Minyak Resep', 'Minyak Rendam');

-- 2. Hapus resep lama untuk semua SKU Cane
DELETE FROM master_resep
WHERE produk_sku_id IN (
  SELECT id FROM produk_sku WHERE brand = 'cane'
);

-- 3. Insert resep Cane Regular (Original / Melted Choco / Grated Cheese)
--    → pakai canonical SKU: brand='cane', varian != 'Whole Wheat', LIMIT 1
DO $$
DECLARE
  sku_regular   UUID;
  sku_ww        UUID;
  admin_id      UUID;
  b_terigu      UUID;
  b_margbb      UUID;
  b_garam       UUID;
  b_gula        UUID;
  b_air         UUID;
  b_minyak_r    UUID;
  b_minyak_rd   UUID;
  b_telur       UUID;
  b_bp          UUID;
  b_tgw         UUID;
BEGIN
  -- Ambil SKU IDs
  SELECT id INTO sku_regular FROM produk_sku
    WHERE brand = 'cane' AND varian != 'Whole Wheat' LIMIT 1;
  SELECT id INTO sku_ww FROM produk_sku
    WHERE brand = 'cane' AND varian = 'Whole Wheat' LIMIT 1;

  -- Ambil admin user ID
  SELECT id INTO admin_id FROM users LIMIT 1;

  -- Ambil bahan IDs
  SELECT id INTO b_terigu    FROM bahan_baku WHERE nama = 'Terigu'            AND aktif = true LIMIT 1;
  SELECT id INTO b_margbb    FROM bahan_baku WHERE nama = 'Margarine Blue Band' AND aktif = true LIMIT 1;
  SELECT id INTO b_garam     FROM bahan_baku WHERE nama = 'Garam'             AND aktif = true LIMIT 1;
  SELECT id INTO b_gula      FROM bahan_baku WHERE nama = 'Gula'              AND aktif = true LIMIT 1;
  SELECT id INTO b_air       FROM bahan_baku WHERE nama = 'Air'               AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_r  FROM bahan_baku WHERE nama = 'Minyak Resep'      AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_rd FROM bahan_baku WHERE nama = 'Minyak Rendam'     AND aktif = true LIMIT 1;
  SELECT id INTO b_telur     FROM bahan_baku WHERE nama = 'Telur'             AND aktif = true LIMIT 1;
  SELECT id INTO b_bp        FROM bahan_baku WHERE nama = 'Baking Powder'     AND aktif = true LIMIT 1;
  SELECT id INTO b_tgw       FROM bahan_baku WHERE nama = 'Tepung Gandum'     AND aktif = true LIMIT 1;

  -- ── Resep Cane Regular (/kg) ──────────────────────────────
  IF sku_regular IS NOT NULL THEN
    INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
      (sku_regular, b_terigu,    1,     'Kg',   admin_id),
      (sku_regular, b_margbb,    75,    'gr',   admin_id),
      (sku_regular, b_garam,     17.5,  'gr',   admin_id),
      (sku_regular, b_gula,      20,    'gr',   admin_id),
      (sku_regular, b_air,       500,   'ml',   admin_id),
      (sku_regular, b_minyak_r,  50,    'ml',   admin_id),
      (sku_regular, b_minyak_rd, 100,   'ml',   admin_id),
      (sku_regular, b_telur,     2,     'Pcs',  admin_id),
      (sku_regular, b_bp,        10,    'gr',   admin_id);
  END IF;

  -- ── Resep Cane Whole Wheat (/kg) ─────────────────────────
  IF sku_ww IS NOT NULL THEN
    INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
      (sku_ww, b_terigu,    500,   'gr',   admin_id),
      (sku_ww, b_margbb,    75,    'gr',   admin_id),
      (sku_ww, b_garam,     17.5,  'gr',   admin_id),
      (sku_ww, b_gula,      20,    'gr',   admin_id),
      (sku_ww, b_air,       500,   'ml',   admin_id),
      (sku_ww, b_minyak_r,  50,    'ml',   admin_id),
      (sku_ww, b_minyak_rd, 100,   'ml',   admin_id),
      (sku_ww, b_telur,     2,     'Pcs',  admin_id),
      (sku_ww, b_bp,        10,    'gr',   admin_id),
      (sku_ww, b_tgw,       500,   'gr',   admin_id);
  END IF;

END $$;

-- 4. Verifikasi hasil
SELECT
  ps.brand,
  ps.varian,
  bb.nama   AS bahan,
  mr.jumlah_per_pack,
  mr.satuan
FROM master_resep mr
JOIN produk_sku  ps ON ps.id = mr.produk_sku_id
JOIN bahan_baku  bb ON bb.id = mr.bahan_baku_id
WHERE ps.brand = 'cane'
ORDER BY ps.varian, bb.nama;
