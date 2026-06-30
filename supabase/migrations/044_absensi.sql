-- ============================================================
-- 044_absensi.sql  —  TAHAP 1 Sistem Absensi
-- Fondasi: karyawan, shift master (4 shift), shift assignment.
-- (Check-in / GPS / foto / denda = tahap berikutnya, belum dibuat.)
-- ============================================================

-- A) Tabel karyawan
CREATE TABLE IF NOT EXISTS karyawan (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama                text        NOT NULL,
  jabatan             text,
  no_hp               text,
  tanggal_masuk_kerja date,
  pin_absensi         text,                                   -- hash SHA-256 PIN 6 digit
  user_id             uuid        REFERENCES users(id) ON DELETE SET NULL,  -- link ke akun ERP (nullable)
  status              text        NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  created_at          timestamptz DEFAULT now()
);

-- B) Tabel shift master (definisi 4 shift)
CREATE TABLE IF NOT EXISTS shift_master (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_shift  text        NOT NULL,
  jam_masuk   time        NOT NULL,
  jam_pulang  time        NOT NULL
);

INSERT INTO shift_master (nama_shift, jam_masuk, jam_pulang) VALUES
  ('Shift 1', '06:00', '16:00'),
  ('Shift 2', '08:00', '18:00'),
  ('Shift 3', '10:00', '20:00'),
  ('Shift 4', '13:00', '23:00')
ON CONFLICT DO NOTHING;

-- C) Tabel shift assignment (jadwal per karyawan per tanggal)
CREATE TABLE IF NOT EXISTS shift_assignment (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  karyawan_id  uuid        NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tanggal      date        NOT NULL,
  shift_id     uuid        REFERENCES shift_master(id) ON DELETE SET NULL,  -- null jika libur
  is_libur     boolean     NOT NULL DEFAULT false,
  created_by   text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (karyawan_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_shift_assignment_tanggal  ON shift_assignment (tanggal);
CREATE INDEX IF NOT EXISTS idx_shift_assignment_karyawan ON shift_assignment (karyawan_id);

-- RLS (write dikontrol di app level — Super Admin only)
ALTER TABLE karyawan         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_master     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "karyawan_all"         ON karyawan;
DROP POLICY IF EXISTS "shift_master_all"     ON shift_master;
DROP POLICY IF EXISTS "shift_assignment_all" ON shift_assignment;

CREATE POLICY "karyawan_all"         ON karyawan         FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "shift_master_all"     ON shift_master     FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "shift_assignment_all" ON shift_assignment FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Verifikasi
SELECT nama_shift, jam_masuk, jam_pulang FROM shift_master ORDER BY nama_shift;
