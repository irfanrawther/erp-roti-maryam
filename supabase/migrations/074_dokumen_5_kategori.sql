-- ============================================================
-- 074_dokumen_5_kategori.sql
-- Slot dokumen (Perjanjian Kerja + Peraturan Perusahaan) dipecah
-- dari 3 jalur (training/staff/spv) jadi 5 kategori jabatan
-- (training_produksi/training_packing/staff_produksi/
-- staff_packing/spv) — mengikuti kategori_dokumen karyawan yang
-- sudah 5 nilai sejak sebelumnya.
--
-- Data existing: semua dokumen jalur='training' & jalur='staff'
-- yang ada saat ini isinya memang untuk jalur Produksi (dicek
-- manual — namanya "Masa Training" & "Staff Produksi", tidak ada
-- yang untuk Packing), jadi dipetakan ke *_produksi. Slot
-- *_packing sengaja kosong dulu (belum ada dokumen), akan
-- diupload menyusul di halaman Kelola Dokumen. jalur='spv' tidak
-- berubah (sudah cocok).
-- ============================================================

UPDATE public.dokumen SET jalur = 'training_produksi' WHERE jalur = 'training';
UPDATE public.dokumen SET jalur = 'staff_produksi'    WHERE jalur = 'staff';

SELECT id, nama, jalur, jenis, versi, is_aktif FROM public.dokumen ORDER BY jalur, jenis;
