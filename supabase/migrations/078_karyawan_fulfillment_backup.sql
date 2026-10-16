-- ============================================================
-- 078_karyawan_fulfillment_backup.sql
-- Toggle per-karyawan: "juga ikut Fulfillment" — untuk anak Produksi
-- tertentu yang kadang backup di Fulfillment, supaya mereka wajib
-- tanda tangan dokumen PK + PP Fulfillment juga (sesuai level
-- training/staff mereka saat ini), terpisah dari dokumen kategori
-- utamanya. Default false — hanya dicentang manual oleh Super Admin
-- per karyawan di halaman Kelola Dokumen.
-- ============================================================

ALTER TABLE public.karyawan
  ADD COLUMN IF NOT EXISTS boleh_fulfillment boolean NOT NULL DEFAULT false;
