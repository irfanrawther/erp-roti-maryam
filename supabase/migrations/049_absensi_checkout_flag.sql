-- ============================================================
-- 049_absensi_checkout_flag.sql
-- Fix check-out lewat tengah malam: sesi terikat tanggal shift.
-- Tambah kolom flag "lupa check-out" untuk review Super Admin.
-- ============================================================

ALTER TABLE public.absensi
  ADD COLUMN IF NOT EXISTS is_checkout_flagged   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason_checkout  text,                        -- 'lupa_checkout'
  ADD COLUMN IF NOT EXISTS checkout_override_by  text,
  ADD COLUMN IF NOT EXISTS checkout_override_at  timestamptz;

-- Index bantu: cari sesi open (belum checkout, belum di-flag)
CREATE INDEX IF NOT EXISTS idx_absensi_open_session
  ON public.absensi (karyawan_id, tanggal)
  WHERE jam_checkout IS NULL;

-- Absensi sudah punya policy FOR ALL TO authenticated, anon (migration 045).
-- Kolom baru otomatis ikut policy tsb, tidak perlu GRANT tambahan.

-- Verifikasi
SELECT column_name FROM information_schema.columns
WHERE table_name = 'absensi'
  AND column_name IN ('is_checkout_flagged','flag_reason_checkout','checkout_override_by','checkout_override_at');
