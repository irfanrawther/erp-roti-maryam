-- ============================================================
-- 057_verifikasi_izin.sql
-- Super Admin: verifikasi foto bukti izin + hapus/toleransi denda.
-- ============================================================

ALTER TABLE public.pengajuan_izin
  ADD COLUMN IF NOT EXISTS foto_verified      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS foto_verified_oleh text,
  ADD COLUMN IF NOT EXISTS foto_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS denda_dihapus      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS denda_dihapus_oleh text,
  ADD COLUMN IF NOT EXISTS denda_dihapus_at   timestamptz,
  ADD COLUMN IF NOT EXISTS catatan_denda      text;

SELECT 'verifikasi_izin columns added' AS info;
