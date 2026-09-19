-- ============================================================
-- 075_dokumen_file_baca.sql
-- Kolom terpisah untuk PDF "asli" yang ditampilkan apa adanya saat
-- karyawan klik "Baca" (warna teks, format, tata letak persis file
-- Word aslinya) — beda dari `file_pdf_url` (sumber docx yang
-- dikonversi ke konten_html untuk kolom isian & tanda tangan).
--
-- Opsional: kalau kosong, mode Baca fallback ke tampilan
-- konten_html terstruktur seperti sebelumnya.
-- ============================================================

ALTER TABLE public.dokumen
  ADD COLUMN IF NOT EXISTS file_baca_url text;

SELECT 'file_baca_url added' AS info;
