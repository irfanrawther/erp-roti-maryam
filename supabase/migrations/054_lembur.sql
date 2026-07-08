-- ============================================================
-- 054_lembur.sql
-- Lembur direncanakan di muka: Super Admin set jadwal custom di
-- shift_assignment. Lembur = jam ekstra di luar jadwal normal.
-- Tarif 10.000/jam, selalu jam bulat (di-set manual).
-- ============================================================

ALTER TABLE public.shift_assignment
  ADD COLUMN IF NOT EXISTS jam_masuk_custom  time,
  ADD COLUMN IF NOT EXISTS jam_pulang_custom time,
  ADD COLUMN IF NOT EXISTS jam_lembur        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nominal_lembur    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lembur_set_by     text,
  ADD COLUMN IF NOT EXISTS lembur_catatan    text;

-- shift_assignment sudah punya policy FOR ALL TO authenticated, anon (migration 044).
-- Kolom baru otomatis ikut policy tsb.

-- Verifikasi
SELECT column_name FROM information_schema.columns
WHERE table_name = 'shift_assignment'
  AND column_name IN ('jam_masuk_custom','jam_pulang_custom','jam_lembur','nominal_lembur');
