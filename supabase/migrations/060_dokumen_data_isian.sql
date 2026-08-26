-- ============================================================
-- 060_dokumen_data_isian.sql
-- Simpan field titik-titik yang diisi masing-masing pihak:
-- karyawan isi Pihak Kedua (di dokumen_persetujuan), Super Admin
-- isi Pihak Pertama (di dokumen_ttd_perusahaan).
-- ============================================================

ALTER TABLE public.dokumen_persetujuan
  ADD COLUMN IF NOT EXISTS data_isian jsonb;

ALTER TABLE public.dokumen_ttd_perusahaan
  ADD COLUMN IF NOT EXISTS data_isian jsonb;

SELECT 'dokumen data_isian columns added' AS info;
