-- ============================================================
-- 065_dokumen_konten_html.sql
-- Simpan hasil konversi docx → HTML terstruktur per slot dokumen,
-- supaya halaman karyawan merender isi dokumen (heading, pasal,
-- tabel) langsung — bukan embed PDF — dan field titik-titik bisa
-- diisi inline.
--
-- Konversi dilakukan sekali saat upload (mammoth), hasilnya
-- disimpan di sini agar cepat dibuka dari HP.
--
-- TIDAK ada tabel baru: penyimpanan tanda tangan tetap memakai
-- dokumen_persetujuan (data_isian, tanda_tangan_url, dokumen_versi)
-- dan dokumen_ttd_perusahaan yang sudah ada.
-- ============================================================

ALTER TABLE public.dokumen
  ADD COLUMN IF NOT EXISTS konten_html    text,
  ADD COLUMN IF NOT EXISTS konten_html_at timestamptz;

SELECT id, nama, jalur, jenis, versi,
       (konten_html IS NOT NULL) AS sudah_dikonversi
  FROM public.dokumen
 WHERE is_aktif = true
 ORDER BY jalur, jenis;
