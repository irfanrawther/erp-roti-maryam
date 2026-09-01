-- ============================================================
-- Tambalan: migrasi 069 yang benar-benar dijalankan adalah versi
-- LAMA (sebelum audit_kebersihan_roster_harian dipisah dari
-- audit_kebersihan_template). Migrasi ini menambahkan bagian yang
-- belum ada, TANPA menyentuh tabel yang sudah ada.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_kebersihan_roster_harian (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal      date NOT NULL,
  karyawan_id  uuid NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  shift_id     uuid REFERENCES shift_master(id) ON DELETE SET NULL,
  nama_tugas   text NOT NULL,           -- Job Desc Pulang (diaudit SPV)
  nama_tugas_datang text,               -- Job Desc Datang (tampil di Dashboard Saya, tidak diaudit)
  urutan       int NOT NULL DEFAULT 0,
  is_aktif     boolean NOT NULL DEFAULT true,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tanggal, karyawan_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_roster_tanggal ON audit_kebersihan_roster_harian(tanggal);

ALTER TABLE audit_kebersihan_hasil
  ADD COLUMN IF NOT EXISTS roster_harian_id uuid REFERENCES audit_kebersihan_roster_harian(id) ON DELETE SET NULL;

ALTER TABLE audit_kebersihan_roster_harian ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_kebersihan_roster_harian_all ON audit_kebersihan_roster_harian FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_kebersihan_roster_harian TO anon, authenticated, service_role;
