-- ============================================================
-- 076_pengajuan_izin_alasan.sql
-- Kolom alasan izin (WAJIB diisi untuk izin_biasa di form /izin,
-- foto tetap opsional seperti sebelumnya). izin_sakit tidak
-- terpengaruh — surat sakit sudah jadi buktinya.
-- ============================================================

ALTER TABLE public.pengajuan_izin
  ADD COLUMN IF NOT EXISTS alasan text;

SELECT 'alasan column added' AS info;
