-- ============================================================
-- Audit Kebersihan Terjadwal
--
-- Modul baru untuk checklist kebersihan terstruktur (Audit Harian,
-- Piket Toilet & Kulkas, Deep Clean Area, Deep Clean Alat) yang
-- diisi SPV dari HP. Item yang gagal masuk ke sistem Poin &
-- Pelanggaran yang SUDAH ADA (laporan_pelanggaran, master_pelanggaran,
-- alur review/klarifikasi) — bukan sistem poin terpisah.
--
-- Tidak ada tabel/kolom pelanggaran lama yang diubah perilakunya;
-- 2 kolom baru di laporan_pelanggaran (audit_hasil_id, poin_override)
-- nullable dan tidak mempengaruhi baris lama sama sekali.
-- ============================================================

-- ── 1a. Roster mingguan Job Desc Pulang (Audit Harian) ──
-- Siapa kerja apa TIAP TANGGAL SPESIFIK — bukan template tetap per hari
-- dalam seminggu, karena assignment-nya di-rolling harian oleh SPV tanpa
-- pola tetap. SPV isi untuk minggu depan, biasanya di-copy dari minggu
-- lalu lalu diedit (logic copy ada di kode, bukan di migrasi ini).
CREATE TABLE IF NOT EXISTS audit_kebersihan_roster_harian (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal      date NOT NULL,
  karyawan_id  uuid NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  shift_id     uuid REFERENCES shift_master(id) ON DELETE SET NULL,
  nama_tugas   text NOT NULL,   -- Job Desc Pulang (yang diaudit; Job Desc Datang tidak disimpan di sini)
  urutan       int NOT NULL DEFAULT 0,
  is_aktif     boolean NOT NULL DEFAULT true,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tanggal, karyawan_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_roster_tanggal ON audit_kebersihan_roster_harian(tanggal);

-- ── 1b. Template checklist Piket & Deep Clean (basis shift group, jarang berubah) ──
CREATE TABLE IF NOT EXISTS audit_kebersihan_template (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_audit   text NOT NULL CHECK (jenis_audit IN ('piket', 'deep_clean_area', 'deep_clean_alat')),
  area_label    text,
  nama_tugas    text NOT NULL,
  shift_id      uuid REFERENCES shift_master(id) ON DELETE SET NULL,  -- shift group penanggung jawab area ini
  urutan        int NOT NULL DEFAULT 0,
  is_aktif      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_template_jenis ON audit_kebersihan_template(jenis_audit, is_aktif);

-- ── 2. Sesi audit (satu per tanggal_tugas + pagi/malam) ──
CREATE TABLE IF NOT EXISTS audit_kebersihan_sesi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal_tugas       date NOT NULL,
  sesi                text NOT NULL CHECK (sesi IN ('pagi', 'malam')),
  auditor_karyawan_id uuid REFERENCES karyawan(id),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'selesai')),
  mulai_at            timestamptz NOT NULL DEFAULT now(),
  selesai_at          timestamptz,
  UNIQUE (tanggal_tugas, sesi)
);

-- ── 3. Hasil per item checklist dalam satu sesi ──
-- template_id ATAU roster_harian_id yang terisi (tergantung jenis_audit),
-- tidak pernah dua-duanya. Snapshot teks supaya histori tidak berubah
-- kalau roster/template diedit belakangan.
CREATE TABLE IF NOT EXISTS audit_kebersihan_hasil (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi_id                uuid NOT NULL REFERENCES audit_kebersihan_sesi(id) ON DELETE CASCADE,
  template_id            uuid REFERENCES audit_kebersihan_template(id) ON DELETE SET NULL,
  roster_harian_id       uuid REFERENCES audit_kebersihan_roster_harian(id) ON DELETE SET NULL,
  jenis_audit_snapshot   text,
  area_label_snapshot    text,
  nama_tugas_snapshot    text,
  status                 text NOT NULL CHECK (status IN ('lulus', 'gagal')),
  penanggung_jawab_tipe  text CHECK (penanggung_jawab_tipe IN ('individu', 'shift_tidak_pasti')),
  karyawan_id            uuid REFERENCES karyawan(id),
  catatan                text,
  foto_bukti_urls        jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_hasil_sesi ON audit_kebersihan_hasil(sesi_id);

-- ── 4. Sambungan ke laporan_pelanggaran yang sudah ada (additive) ──
ALTER TABLE laporan_pelanggaran
  ADD COLUMN IF NOT EXISTS audit_hasil_id uuid REFERENCES audit_kebersihan_hasil(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS poin_override  numeric;

-- ── 5. SPV penanggung jawab audit (editable, bukan hardcode) ──
CREATE TABLE IF NOT EXISTS audit_kebersihan_spv (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi        text NOT NULL UNIQUE CHECK (sesi IN ('pagi', 'malam')),
  karyawan_id uuid NOT NULL REFERENCES karyawan(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO audit_kebersihan_spv (sesi, karyawan_id) VALUES
  ('pagi',  '1d5e682a-caad-496e-ab3e-0e872d0f730e'),  -- Nofita
  ('malam', 'fb6cf13a-22d7-4fbf-8c3f-e3e2951352fd')   -- Adam
ON CONFLICT (sesi) DO NOTHING;

-- RLS — buka untuk anon+authenticated seperti tabel lain di app ini
-- (app tidak pakai Supabase Auth sungguhan, kontrol akses di level app).
ALTER TABLE audit_kebersihan_roster_harian ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_kebersihan_template      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_kebersihan_sesi          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_kebersihan_hasil         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_kebersihan_spv           ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_kebersihan_roster_harian_all ON audit_kebersihan_roster_harian FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY audit_kebersihan_template_all      ON audit_kebersihan_template      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY audit_kebersihan_sesi_all          ON audit_kebersihan_sesi          FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY audit_kebersihan_hasil_all         ON audit_kebersihan_hasil         FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY audit_kebersihan_spv_all           ON audit_kebersihan_spv           FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_roster_harian TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_template      TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_sesi          TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_hasil         TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_spv           TO anon, authenticated, service_role;
