-- ============================================================
-- 051_izin_sakit.sql
-- Lapor Izin Sakit: extend pengajuan_izin dengan kolom surat dokter.
-- jenis = 'izin_sakit'. Surat wajib upload maks jam 20:00 hari sakit.
-- ============================================================

ALTER TABLE public.pengajuan_izin
  ADD COLUMN IF NOT EXISTS foto_surat_url     text,
  ADD COLUMN IF NOT EXISTS status_surat       text,        -- 'menunggu_surat' | 'surat_masuk' | 'surat_telat'
  ADD COLUMN IF NOT EXISTS batas_upload_surat timestamptz, -- deadline jam 20:00 hari sakit
  ADD COLUMN IF NOT EXISTS surat_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS override_by        text,
  ADD COLUMN IF NOT EXISTS override_at        timestamptz,
  ADD COLUMN IF NOT EXISTS catatan_override   text;

-- pengajuan_izin sudah punya policy FOR ALL TO authenticated, anon (migration 050).
-- Kolom baru otomatis ikut policy tsb.

-- Verifikasi
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pengajuan_izin'
  AND column_name IN ('foto_surat_url','status_surat','batas_upload_surat','surat_uploaded_at','override_by');
