-- ============================================================
-- 013_cane_4_skus.sql
-- Pisah varian Cane RawtheR jadi 4 SKU terpisah
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- 1. Pastikan Minyak Resep & Minyak Rendam ada di bahan_baku
INSERT INTO bahan_baku (nama, satuan, stok_minimum, brand, aktif)
VALUES
  ('Minyak Resep',  'Liter', 5,  'cane', true),
  ('Minyak Rendam', 'Liter', 10, 'cane', true)
ON CONFLICT DO NOTHING;
UPDATE bahan_baku SET aktif = true WHERE nama IN ('Minyak Resep', 'Minyak Rendam');

-- 2. Tambah 4 SKU Cane terpisah
INSERT INTO produk_sku (brand, nama_brand, varian, isi_per_pack, kode_sku, aktif)
VALUES
  ('cane', 'Cane RawtheR', 'Original',      20, 'CANE-ORIG', true),
  ('cane', 'Cane RawtheR', 'Melted Choco',  25, 'CANE-MC',   true),
  ('cane', 'Cane RawtheR', 'Grated Cheese', 25, 'CANE-GC',   true),
  ('cane', 'Cane RawtheR', 'Whole Wheat',   20, 'CANE-WW',   true)
ON CONFLICT (kode_sku) DO UPDATE
  SET varian = EXCLUDED.varian,
      isi_per_pack = EXCLUDED.isi_per_pack,
      aktif = true;

-- 3. Nonaktifkan SKU Cane lama yang bukan 4 varian di atas
UPDATE produk_sku
SET aktif = false
WHERE brand = 'cane'
  AND kode_sku NOT IN ('CANE-ORIG', 'CANE-MC', 'CANE-GC', 'CANE-WW');

-- 4. Hapus semua resep lama untuk SKU Cane yang aktif
DELETE FROM master_resep
WHERE produk_sku_id IN (
  SELECT id FROM produk_sku WHERE brand = 'cane'
);

-- 5. Insert resep baru — 4 varian × bahan
DO $$
DECLARE
  sku_orig    UUID;
  sku_mc      UUID;
  sku_gc      UUID;
  sku_ww      UUID;
  admin_id    UUID;
  b_terigu    UUID;
  b_margbb    UUID;
  b_garam     UUID;
  b_gula      UUID;
  b_air       UUID;
  b_minyak_r  UUID;
  b_minyak_rd UUID;
  b_telur     UUID;
  b_bp        UUID;
  b_tgw       UUID;
  v_sku       UUID;
BEGIN
  SELECT id INTO sku_orig FROM produk_sku WHERE kode_sku = 'CANE-ORIG';
  SELECT id INTO sku_mc   FROM produk_sku WHERE kode_sku = 'CANE-MC';
  SELECT id INTO sku_gc   FROM produk_sku WHERE kode_sku = 'CANE-GC';
  SELECT id INTO sku_ww   FROM produk_sku WHERE kode_sku = 'CANE-WW';
  SELECT id INTO admin_id FROM users LIMIT 1;

  SELECT id INTO b_terigu    FROM bahan_baku WHERE nama = 'Terigu'              AND aktif = true LIMIT 1;
  SELECT id INTO b_margbb    FROM bahan_baku WHERE nama = 'Margarine Blue Band' AND aktif = true LIMIT 1;
  SELECT id INTO b_garam     FROM bahan_baku WHERE nama = 'Garam'               AND aktif = true LIMIT 1;
  SELECT id INTO b_gula      FROM bahan_baku WHERE nama = 'Gula'                AND aktif = true LIMIT 1;
  SELECT id INTO b_air       FROM bahan_baku WHERE nama = 'Air'                 AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_r  FROM bahan_baku WHERE nama = 'Minyak Resep'        AND aktif = true LIMIT 1;
  SELECT id INTO b_minyak_rd FROM bahan_baku WHERE nama = 'Minyak Rendam'       AND aktif = true LIMIT 1;
  SELECT id INTO b_telur     FROM bahan_baku WHERE nama = 'Telur'               AND aktif = true LIMIT 1;
  SELECT id INTO b_bp        FROM bahan_baku WHERE nama = 'Baking Powder'       AND aktif = true LIMIT 1;
  SELECT id INTO b_tgw       FROM bahan_baku WHERE nama = 'Tepung Gandum'       AND aktif = true LIMIT 1;

  -- ── Original ──────────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_orig, b_terigu,    1,    'Kg',  admin_id),
    (sku_orig, b_margbb,    75,   'gr',  admin_id),
    (sku_orig, b_garam,     17.5, 'gr',  admin_id),
    (sku_orig, b_gula,      20,   'gr',  admin_id),
    (sku_orig, b_air,       500,  'ml',  admin_id),
    (sku_orig, b_minyak_r,  50,   'ml',  admin_id),
    (sku_orig, b_minyak_rd, 100,  'ml',  admin_id),
    (sku_orig, b_telur,     2,    'Pcs', admin_id),
    (sku_orig, b_bp,        10,   'gr',  admin_id);

  -- ── Melted Choco ──────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_mc, b_terigu,    1,    'Kg',  admin_id),
    (sku_mc, b_margbb,    75,   'gr',  admin_id),
    (sku_mc, b_garam,     17.5, 'gr',  admin_id),
    (sku_mc, b_gula,      20,   'gr',  admin_id),
    (sku_mc, b_air,       500,  'ml',  admin_id),
    (sku_mc, b_minyak_r,  50,   'ml',  admin_id),
    (sku_mc, b_minyak_rd, 100,  'ml',  admin_id),
    (sku_mc, b_telur,     2,    'Pcs', admin_id),
    (sku_mc, b_bp,        10,   'gr',  admin_id);

  -- ── Grated Cheese ─────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_gc, b_terigu,    1,    'Kg',  admin_id),
    (sku_gc, b_margbb,    75,   'gr',  admin_id),
    (sku_gc, b_garam,     17.5, 'gr',  admin_id),
    (sku_gc, b_gula,      20,   'gr',  admin_id),
    (sku_gc, b_air,       500,  'ml',  admin_id),
    (sku_gc, b_minyak_r,  50,   'ml',  admin_id),
    (sku_gc, b_minyak_rd, 100,  'ml',  admin_id),
    (sku_gc, b_telur,     2,    'Pcs', admin_id),
    (sku_gc, b_bp,        10,   'gr',  admin_id);

  -- ── Whole Wheat ───────────────────────────────────────────
  INSERT INTO master_resep (produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, created_by) VALUES
    (sku_ww, b_terigu,    500,  'gr',  admin_id),
    (sku_ww, b_margbb,    75,   'gr',  admin_id),
    (sku_ww, b_garam,     17.5, 'gr',  admin_id),
    (sku_ww, b_gula,      20,   'gr',  admin_id),
    (sku_ww, b_air,       500,  'ml',  admin_id),
    (sku_ww, b_minyak_r,  50,   'ml',  admin_id),
    (sku_ww, b_minyak_rd, 100,  'ml',  admin_id),
    (sku_ww, b_telur,     2,    'Pcs', admin_id),
    (sku_ww, b_bp,        10,   'gr',  admin_id),
    (sku_ww, b_tgw,       500,  'gr',  admin_id);

END $$;

-- 6. Verifikasi
SELECT ps.varian, bb.nama, mr.jumlah_per_pack, mr.satuan
FROM master_resep mr
JOIN produk_sku  ps ON ps.id = mr.produk_sku_id
JOIN bahan_baku  bb ON bb.id = mr.bahan_baku_id
WHERE ps.brand = 'cane' AND ps.aktif = true
ORDER BY ps.varian, bb.nama;
