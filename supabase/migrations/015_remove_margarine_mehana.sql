-- ============================================================
-- 015_remove_margarine_mehana.sql
-- Hapus Margarine Menara dari resep adonan Mehana
-- Jalankan di Supabase SQL Editor
-- ============================================================

DELETE FROM master_resep
WHERE produk_sku_id IN (
  SELECT id FROM produk_sku WHERE brand = 'mehana'
)
AND bahan_baku_id = (
  SELECT id FROM bahan_baku WHERE nama = 'Margarine Menara' LIMIT 1
);

-- Verifikasi: pastikan Margarine Menara tidak ada di resep Mehana
SELECT ps.varian, bb.nama, mr.jumlah_per_pack, mr.satuan
FROM master_resep mr
JOIN produk_sku  ps ON ps.id = mr.produk_sku_id
JOIN bahan_baku  bb ON bb.id = mr.bahan_baku_id
WHERE ps.brand = 'mehana' AND ps.aktif = true
ORDER BY ps.varian, bb.nama;
