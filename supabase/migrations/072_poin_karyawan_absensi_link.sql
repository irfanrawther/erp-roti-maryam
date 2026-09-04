-- ============================================================
-- Sambungkan poin_karyawan (khusus poin telat otomatis) ke baris
-- absensi yang menyebabkannya, supaya kalau Super Admin override
-- absensi itu (koreksi jam masuk, hapus denda, ubah jadi izin/alpha,
-- dsb), poin yang sudah kadung masuk bisa disinkronkan ulang —
-- bukan nyangkut selamanya.
--
-- Nullable & additive, tidak mengubah baris lama.
-- ============================================================
ALTER TABLE poin_karyawan
  ADD COLUMN IF NOT EXISTS absensi_id uuid REFERENCES absensi(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poin_karyawan_absensi ON poin_karyawan(absensi_id) WHERE absensi_id IS NOT NULL;
