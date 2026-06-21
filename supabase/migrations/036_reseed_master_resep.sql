-- ============================================================
-- 036_reseed_master_resep.sql
-- Repair master_resep: migration 019 wiped "Minyak Resep" dan
-- "Minyak Rendam" entries saat mengkonsolidasi ke satu "Minyak".
-- Re-seed dengan resep lengkap untuk semua SKU aktif.
-- ============================================================

-- 1. Diagnosis: tampilkan state master_resep sebelum repair
SELECT
  ps.brand, ps.varian, ps.kode_sku,
  bb.nama AS bahan,
  mr.jumlah_per_pack,
  mr.satuan,
  mr.label
FROM master_resep mr
JOIN produk_sku ps ON ps.id = mr.produk_sku_id
JOIN bahan_baku bb ON bb.id = mr.bahan_baku_id
WHERE ps.aktif = true
ORDER BY ps.brand, ps.varian, bb.nama;

-- 2. Repair: hapus master_resep lama dan re-seed penuh
DO $$
DECLARE
  sku_id    UUID;
  admin_id  UUID;
  b_terigu  UUID;
  b_margbb  UUID;
  b_garam   UUID;
  b_gula    UUID;
  b_air     UUID;
  b_minyak  UUID;
  b_telur   UUID;
  b_bp      UUID;
  b_tgw     UUID;
BEGIN
  SELECT id INTO admin_id FROM users LIMIT 1;
  SELECT id INTO b_terigu  FROM bahan_baku WHERE nama = 'Terigu'              AND aktif = true LIMIT 1;
  SELECT id INTO b_margbb  FROM bahan_baku WHERE nama = 'Margarine Blue Band' AND aktif = true LIMIT 1;
  SELECT id INTO b_garam   FROM bahan_baku WHERE nama = 'Garam'               AND aktif = true LIMIT 1;
  SELECT id INTO b_gula    FROM bahan_baku WHERE nama = 'Gula'                AND aktif = true LIMIT 1;
  SELECT id INTO b_air     FROM bahan_baku WHERE nama = 'Air'                 AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak  FROM bahan_baku WHERE nama = 'Minyak'              AND aktif = true LIMIT 1;
  SELECT id INTO b_telur   FROM bahan_baku WHERE nama = 'Telur'               AND aktif = true LIMIT 1;
  SELECT id INTO b_bp      FROM bahan_baku WHERE nama = 'Baking Powder'       AND aktif = true LIMIT 1;
  SELECT id INTO b_tgw     FROM bahan_baku WHERE nama = 'Tepung Gandum'       AND aktif = true LIMIT 1;

  -- Hapus semua master_resep lama untuk SKU aktif
  DELETE FROM master_resep
  WHERE produk_sku_id IN (SELECT id FROM produk_sku WHERE aktif = true);

  -- ── CANE Regular (Original, Melted Choco, Grated Cheese) ──────
  FOR sku_id IN
    SELECT id FROM produk_sku
    WHERE brand = 'cane' AND aktif = true AND varian != 'Whole Wheat'
  LOOP
    INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, label, created_by) VALUES
      (sku_id, b_terigu,  1,     'kg',  'Terigu',              admin_id),
      (sku_id, b_margbb,  75,    'gr',  'Margarine Blue Band', admin_id),
      (sku_id, b_garam,   17.5,  'gr',  'Garam',               admin_id),
      (sku_id, b_gula,    20,    'gr',  'Gula',                admin_id),
      (sku_id, b_air,     500,   'ml',  'Air',                 admin_id),
      (sku_id, b_minyak,  50,    'ml',  'Minyak Resep',        admin_id),
      (sku_id, b_minyak,  100,   'ml',  'Minyak Rendam',       admin_id),
      (sku_id, b_telur,   2,     'pcs', 'Telur',               admin_id),
      (sku_id, b_bp,      10,    'gr',  'Baking Powder',       admin_id);
  END LOOP;

  -- ── CANE Whole Wheat (tambah Tepung Gandum, Terigu setengah) ──
  FOR sku_id IN
    SELECT id FROM produk_sku
    WHERE brand = 'cane' AND aktif = true AND varian = 'Whole Wheat'
  LOOP
    INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, label, created_by) VALUES
      (sku_id, b_terigu,  500,  'gr',  'Terigu',              admin_id),
      (sku_id, b_margbb,  75,   'gr',  'Margarine Blue Band', admin_id),
      (sku_id, b_garam,   17.5, 'gr',  'Garam',               admin_id),
      (sku_id, b_gula,    20,   'gr',  'Gula',                admin_id),
      (sku_id, b_air,     500,  'ml',  'Air',                 admin_id),
      (sku_id, b_minyak,  50,   'ml',  'Minyak Resep',        admin_id),
      (sku_id, b_minyak,  100,  'ml',  'Minyak Rendam',       admin_id),
      (sku_id, b_telur,   2,    'pcs', 'Telur',               admin_id),
      (sku_id, b_bp,      10,   'gr',  'Baking Powder',       admin_id),
      (sku_id, b_tgw,     500,  'gr',  'Tepung Gandum',       admin_id);
  END LOOP;

  -- ── MEHANA — semua varian (resep adonan dasar sama) ───────────
  FOR sku_id IN
    SELECT id FROM produk_sku WHERE brand = 'mehana' AND aktif = true
  LOOP
    INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, label, created_by) VALUES
      (sku_id, b_terigu,  1,    'kg', 'Terigu',        admin_id),
      (sku_id, b_garam,   17.5, 'gr', 'Garam',         admin_id),
      (sku_id, b_gula,    20,   'gr', 'Gula',          admin_id),
      (sku_id, b_air,     500,  'ml', 'Air',           admin_id),
      (sku_id, b_minyak,  50,   'ml', 'Minyak Resep',  admin_id),
      (sku_id, b_minyak,  100,  'ml', 'Minyak Rendam', admin_id);
  END LOOP;

END $$;

-- 3. Verifikasi akhir
SELECT
  ps.brand, ps.varian,
  mr.label,
  mr.jumlah_per_pack,
  mr.satuan
FROM master_resep mr
JOIN produk_sku ps ON ps.id = mr.produk_sku_id
WHERE ps.aktif = true
ORDER BY ps.brand, ps.varian, mr.label;
