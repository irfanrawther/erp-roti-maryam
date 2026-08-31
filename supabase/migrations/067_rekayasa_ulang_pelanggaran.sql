-- ============================================================
-- 067_rekayasa_ulang_pelanggaran.sql
-- Rebuild halaman Pelanggaran & Poin: alur submit (SPV) → review/
-- klarifikasi (Manajer Operasional) → poin resmi, sesuai Pasal 6
-- PP Training/Staff/SPV. laporan_pelanggaran & laporan_insiden_berat
-- KOSONG (0 baris) saat migrasi ini dibuat — aman diubah strukturnya.
-- poin_karyawan (17 baris) & status_sp_karyawan (4 baris) TIDAK disentuh.
-- ============================================================

-- ── laporan_pelanggaran ─────────────────────────────────────
ALTER TABLE public.laporan_pelanggaran
  ADD COLUMN IF NOT EXISTS jalur                 text,          -- snapshot jalur karyawan saat lapor (training/staff)
  ADD COLUMN IF NOT EXISTS jam_kejadian          time,
  ADD COLUMN IF NOT EXISTS foto_bukti_urls        jsonb,         -- array url, bisa >1 foto
  ADD COLUMN IF NOT EXISTS saksi_karyawan_id      uuid REFERENCES public.karyawan(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saksi_manual           text,
  ADD COLUMN IF NOT EXISTS respon_deadline        timestamptz,   -- created_at + 48 jam: batas diam-dianggap-setuju
  ADD COLUMN IF NOT EXISTS klarifikasi_diminta_at timestamptz,   -- karyawan klik "Saya akan klarifikasi"
  ADD COLUMN IF NOT EXISTS klarifikasi_deadline   timestamptz,   -- batas datang tatap muka (bisa diperpanjang)
  ADD COLUMN IF NOT EXISTS klarifikasi_catatan    text;          -- wajib diisi Manajer saat memproses klarifikasi

-- Migrasi foto lama (kalau ada) ke bentuk array; tabel ini 0 baris saat ini jadi ini no-op, tapi aman untuk masa depan.
UPDATE public.laporan_pelanggaran
   SET foto_bukti_urls = to_jsonb(ARRAY[foto_bukti_url])
 WHERE foto_bukti_url IS NOT NULL AND foto_bukti_urls IS NULL;

CREATE INDEX IF NOT EXISTS idx_laporan_pelanggaran_status ON public.laporan_pelanggaran (status);
CREATE INDEX IF NOT EXISTS idx_laporan_pelanggaran_karyawan ON public.laporan_pelanggaran (karyawan_id);

-- ── laporan_insiden_berat (Tier 4) ──────────────────────────
ALTER TABLE public.laporan_insiden_berat
  ADD COLUMN IF NOT EXISTS pelanggaran_id  uuid REFERENCES public.master_pelanggaran(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foto_bukti_urls jsonb;

UPDATE public.laporan_insiden_berat
   SET foto_bukti_urls = to_jsonb(ARRAY[foto_bukti_url])
 WHERE foto_bukti_url IS NOT NULL AND foto_bukti_urls IS NULL;

SELECT 'pelanggaran rebuild: kolom baru ditambahkan' AS info;
