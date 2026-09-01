-- Tambah kolom Job Desc Datang di roster harian (sebelumnya cuma nama_tugas = Pulang).
-- Job Desc Datang murni untuk ditampilkan ke karyawan (Dashboard Saya), TIDAK diaudit
-- SPV (sesuai mekanisme Audit Kebersihan — yang diaudit cuma tugas Pulang).
ALTER TABLE audit_kebersihan_roster_harian
  ADD COLUMN IF NOT EXISTS nama_tugas_datang text;

COMMENT ON COLUMN audit_kebersihan_roster_harian.nama_tugas IS 'Job Desc Pulang — ini yang diaudit SPV';
COMMENT ON COLUMN audit_kebersihan_roster_harian.nama_tugas_datang IS 'Job Desc Datang — tampil di Dashboard Saya karyawan, tidak diaudit';
