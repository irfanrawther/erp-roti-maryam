-- ============================================================
-- 046_absensi_denda.sql  —  TAHAP 3 Sistem Absensi
-- Kolom denda telat, kategori, flag anomali, status kehadiran,
-- dan override Super Admin.
-- ============================================================

ALTER TABLE absensi
  ADD COLUMN IF NOT EXISTS menit_telat          integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kategori_telat        text,                               -- 'K1' | 'K2' | 'K3' | null
  ADD COLUMN IF NOT EXISTS denda                 integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denda_dihapus_ampun   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_kehadiran      text        NOT NULL DEFAULT 'hadir', -- hadir|alpha|izin_sakit|izin
  ADD COLUMN IF NOT EXISTS is_flagged            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason           text,                               -- 'telat_jauh' | 'datang_kepagian'
  ADD COLUMN IF NOT EXISTS shift_id_koreksi      uuid        REFERENCES shift_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_override           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_by           text,
  ADD COLUMN IF NOT EXISTS override_at           timestamptz,
  ADD COLUMN IF NOT EXISTS catatan_super_admin   text;

CREATE INDEX IF NOT EXISTS idx_absensi_flagged ON absensi (is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_absensi_status  ON absensi (status_kehadiran);

-- (RLS sudah aktif dari migration 045 dengan policy FOR ALL anon)

-- Verifikasi
SELECT column_name FROM information_schema.columns
WHERE table_name = 'absensi' ORDER BY ordinal_position;
