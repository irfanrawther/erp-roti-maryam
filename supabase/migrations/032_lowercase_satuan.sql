-- ============================================================
-- 032_lowercase_satuan.sql
-- Normalise satuan values to lowercase across bahan_baku and
-- penerimaan_bahan_baku.  Maps: Kg→kg, Liter→liter, Pcs→pcs.
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- 1. Tabel bahan_baku (kolom satuan master)
UPDATE bahan_baku SET satuan = 'kg'    WHERE satuan = 'Kg';
UPDATE bahan_baku SET satuan = 'liter' WHERE satuan = 'Liter';
UPDATE bahan_baku SET satuan = 'pcs'   WHERE satuan = 'Pcs';

-- 2. Tabel penerimaan_bahan_baku (kolom satuan tiap transaksi)
UPDATE penerimaan_bahan_baku SET satuan = 'kg'    WHERE satuan = 'Kg';
UPDATE penerimaan_bahan_baku SET satuan = 'liter' WHERE satuan = 'Liter';
UPDATE penerimaan_bahan_baku SET satuan = 'pcs'   WHERE satuan = 'Pcs';

-- 3. Tabel penggunaan_bahan (satuan di riwayat pemakaian adonan)
UPDATE penggunaan_bahan SET satuan = 'kg'    WHERE satuan = 'Kg';
UPDATE penggunaan_bahan SET satuan = 'liter' WHERE satuan = 'Liter';
UPDATE penggunaan_bahan SET satuan = 'pcs'   WHERE satuan = 'Pcs';

-- Verifikasi: cek satuan unik yang ada sekarang
SELECT 'bahan_baku' AS tabel, satuan, COUNT(*) FROM bahan_baku GROUP BY satuan
UNION ALL
SELECT 'penerimaan', satuan, COUNT(*) FROM penerimaan_bahan_baku GROUP BY satuan
ORDER BY 1, 2;
