-- ============================================================
-- 059_dokumen_kategori_ttd_perusahaan.sql
-- 1. Dokumen dibedakan per kategori (training/staff/spv) — tidak
--    lagi ditampilkan ke SEMUA karyawan sekaligus.
-- 2. karyawan.kategori_dokumen: Super Admin assign manual per
--    karyawan kategori dokumen mana yang berlaku untuknya.
-- 3. Tanda tangan pihak perusahaan (Super Admin, per karyawan,
--    per versi dokumen) — terpisah dari dokumen_persetujuan yang
--    memang khusus TTD karyawan.
-- ============================================================

ALTER TABLE public.dokumen
  ADD COLUMN IF NOT EXISTS kategori text NOT NULL DEFAULT 'training';

ALTER TABLE public.karyawan
  ADD COLUMN IF NOT EXISTS kategori_dokumen text;

CREATE TABLE IF NOT EXISTS public.dokumen_ttd_perusahaan (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumen_id           uuid        REFERENCES public.dokumen(id) ON DELETE CASCADE,
  dokumen_versi        integer     NOT NULL,
  karyawan_id          uuid        REFERENCES public.karyawan(id) ON DELETE CASCADE,
  tanda_tangan_url     text,
  diwakili_oleh        text,
  jabatan_perwakilan   text,
  ditandatangani_oleh  text,       -- nama akun Super Admin yang TTD
  ditandatangani_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dokumen_id, dokumen_versi, karyawan_id)
);

ALTER TABLE public.dokumen_ttd_perusahaan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dokumen_ttd_perusahaan_all" ON public.dokumen_ttd_perusahaan;
CREATE POLICY "dokumen_ttd_perusahaan_all" ON public.dokumen_ttd_perusahaan
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Dokumen yang sudah ada saat ini (PK & PP Training) sudah kategori 'training' by default.

SELECT 'dokumen kategori + ttd perusahaan created' AS info;
