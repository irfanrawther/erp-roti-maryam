-- ============================================================
-- 056_denda_izin.sql
-- Pasal 3: denda izin biasa & sakit berdasarkan waktu lapor vs shift.
-- Simpan hasil hitung di pengajuan_izin.
-- ============================================================

ALTER TABLE public.pengajuan_izin
  ADD COLUMN IF NOT EXISTS denda          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kategori_lapor text,      -- 'tepat_waktu' | 'telat_sebelum_shift' | 'setelah_shift'
  ADD COLUMN IF NOT EXISTS sakit_ke       integer,   -- urutan sakit dalam bulan (untuk izin_sakit)
  ADD COLUMN IF NOT EXISTS kuota_penuh    boolean NOT NULL DEFAULT false; -- izin biasa saat kuota harian terisi (Pasal 3c)

SELECT 'denda_izin columns added' AS info;
