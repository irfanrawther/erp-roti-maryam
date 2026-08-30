-- ============================================================
-- 066_koreksi_data_isian.sql
-- Log koreksi field dokumen yang SUDAH ditandatangani (mis. salah
-- ketik Tanggal Mulai Kerja). Super Admin bisa koreksi tanpa perlu
-- tanda tangan ulang; setiap perubahan tercatat siapa & kapan.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dokumen_data_edit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumen_id   uuid        REFERENCES public.dokumen(id) ON DELETE CASCADE,
  dokumen_versi integer    NOT NULL,
  karyawan_id  uuid        REFERENCES public.karyawan(id) ON DELETE CASCADE,
  pemilik      text        NOT NULL,  -- 'karyawan' | 'perusahaan' — bagian mana yang dikoreksi
  field_key    text        NOT NULL,
  nilai_lama   text,
  nilai_baru   text,
  diedit_oleh  text,
  diedit_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dokumen_data_edit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dokumen_data_edit_log_all" ON public.dokumen_data_edit_log;
CREATE POLICY "dokumen_data_edit_log_all" ON public.dokumen_data_edit_log
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

SELECT 'dokumen_data_edit_log created' AS info;
