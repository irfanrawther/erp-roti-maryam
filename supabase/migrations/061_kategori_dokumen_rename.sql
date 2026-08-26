-- ============================================================
-- 061_kategori_dokumen_rename.sql
-- Kategori dokumen dipecah per divisi: training_produksi,
-- training_packing, staff_produksi, staff_packing, spv.
-- Rename default lama 'training' -> 'training_produksi'.
-- ============================================================

UPDATE public.dokumen SET kategori = 'training_produksi' WHERE kategori = 'training';
UPDATE public.karyawan SET kategori_dokumen = 'training_produksi' WHERE kategori_dokumen = 'training';

ALTER TABLE public.dokumen ALTER COLUMN kategori SET DEFAULT 'training_produksi';

SELECT 'kategori dokumen renamed to training_produksi' AS info;
