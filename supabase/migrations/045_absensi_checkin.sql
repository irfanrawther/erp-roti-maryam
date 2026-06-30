-- ============================================================
-- 045_absensi_checkin.sql  —  TAHAP 2 Sistem Absensi
-- Check-in / check-out: pengaturan lokasi dapur + tabel absensi.
-- (Denda/flag = Tahap 3, belum dibuat.)
-- ============================================================

-- A) Pengaturan lokasi dapur (radius geofence)
CREATE TABLE IF NOT EXISTS pengaturan_absensi (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  latitude_dapur  numeric     NOT NULL DEFAULT -6.000000,   -- PLACEHOLDER, di-set via UI
  longitude_dapur numeric     NOT NULL DEFAULT 106.000000,  -- PLACEHOLDER
  radius_meter    integer     NOT NULL DEFAULT 100,
  updated_by      text,
  updated_at      timestamptz DEFAULT now()
);

-- Seed 1 row default (hanya jika tabel masih kosong)
INSERT INTO pengaturan_absensi (latitude_dapur, longitude_dapur, radius_meter)
SELECT -6.000000, 106.000000, 100
WHERE NOT EXISTS (SELECT 1 FROM pengaturan_absensi);

-- B) Tabel absensi (check-in / check-out harian)
CREATE TABLE IF NOT EXISTS absensi (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  karyawan_id      uuid        NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tanggal          date        NOT NULL,
  shift_id         uuid        REFERENCES shift_master(id) ON DELETE SET NULL,
  jam_checkin      timestamptz,
  foto_checkin_url text,
  lat_checkin      numeric,
  lng_checkin      numeric,
  jam_checkout     timestamptz,
  lat_checkout     numeric,
  lng_checkout     numeric,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (karyawan_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_absensi_tanggal  ON absensi (tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_karyawan ON absensi (karyawan_id);

-- RLS (write dikontrol di app level)
ALTER TABLE pengaturan_absensi ENABLE ROW LEVEL SECURITY;
ALTER TABLE absensi            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pengaturan_absensi_all" ON pengaturan_absensi;
DROP POLICY IF EXISTS "absensi_all"            ON absensi;

CREATE POLICY "pengaturan_absensi_all" ON pengaturan_absensi FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "absensi_all"            ON absensi            FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- C) Storage bucket "foto-absensi" (public read) + policy upload anon
INSERT INTO storage.buckets (id, name, public)
VALUES ('foto-absensi', 'foto-absensi', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "foto_absensi_read"   ON storage.objects;
DROP POLICY IF EXISTS "foto_absensi_insert" ON storage.objects;
CREATE POLICY "foto_absensi_read"   ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'foto-absensi');
CREATE POLICY "foto_absensi_insert" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (bucket_id = 'foto-absensi');

-- Verifikasi
SELECT latitude_dapur, longitude_dapur, radius_meter FROM pengaturan_absensi;
