-- ============================================================
-- 064_dokumen_6_slot.sql
-- Modul dokumen dirombak: tiap jalur punya 2 dokumen yang
-- ditandatangani TERPISAH (Perjanjian Kerja + Peraturan
-- Perusahaan) = 6 slot independen:
--   PK Training / PP Training
--   PK Staff    / PP Staff
--   PK SPV      / PP SPV
--
-- Sebelumnya skema mengasumsikan 1 dokumen per kategori.
-- Dokumen gabungan lama TIDAK dihapus (masih dirujuk tanda
-- tangan yang sudah ada), hanya dinonaktifkan.
-- ============================================================

ALTER TABLE public.dokumen
  ADD COLUMN IF NOT EXISTS jalur text,   -- 'training' | 'staff' | 'spv'
  ADD COLUMN IF NOT EXISTS jenis text;   -- 'pk' | 'pp' | 'gabungan' (legacy)

-- Dokumen gabungan lama (PK & PP Masa Training) → arsip, tidak aktif lagi.
UPDATE public.dokumen
   SET jalur = 'training', jenis = 'gabungan', is_aktif = false
 WHERE jenis IS NULL
   AND kategori = 'training_produksi';

-- Sisanya (kalau ada) diturunkan dari kategori.
UPDATE public.dokumen
   SET jalur = CASE
         WHEN kategori LIKE 'training%' THEN 'training'
         WHEN kategori LIKE 'staff%'    THEN 'staff'
         WHEN kategori = 'spv'          THEN 'spv'
         ELSE 'training' END,
       jenis = COALESCE(jenis, 'gabungan')
 WHERE jalur IS NULL;

-- Satu slot aktif per (jalur, jenis).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dokumen_slot_aktif
  ON public.dokumen (jalur, jenis) WHERE is_aktif = true;

SELECT id, nama, jalur, jenis, versi, is_aktif FROM public.dokumen ORDER BY jalur, jenis;
