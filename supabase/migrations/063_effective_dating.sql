-- ============================================================
-- 063_effective_dating.sql
--
-- 1. Revisi 3 item PP SPV yang subjeknya harus Manajer Operasional.
-- 2. Aturan jadi BERLAKU-PER-TANGGAL: satu (jalur, kunci) bisa punya
--    beberapa versi dengan berlaku_mulai berbeda. Perhitungan memilih
--    versi berdasarkan TANGGAL KEJADIAN, bukan tanggal deploy kode.
--
--    Nominal lama (yang sedang berjalan)  → berlaku_mulai 1970-01-01
--    Nominal baru dari 6 dokumen          → berlaku_mulai 2026-09-01
--
--    Jadi periode gaji 1–31 Agustus 2026 tetap memakai nominal lama
--    sampai selesai, dan otomatis beralih mulai 1 September 2026.
-- ============================================================

-- ── 1. Revisi item PP SPV ───────────────────────────────────
-- No.22 — sesuai pemetaan yang diberikan
UPDATE public.master_pelanggaran
   SET nama_pelanggaran = 'Mengoperasikan mesin di luar jobdesk tanpa izin Manajer Operasional',
       catatan = NULL
 WHERE jalur = 'spv' AND nomor = 22;

-- No.24 — subjek instruksi jadi Manajer Operasional
UPDATE public.master_pelanggaran
   SET nama_pelanggaran = 'Berulang kali tidak patuh instruksi Manajer Operasional setelah teguran tertulis',
       catatan = NULL
 WHERE jalur = 'spv' AND nomor = 24;

-- No.20 — redaksi TIDAK diubah (sudah menyebut Manajer Operasional),
-- hanya tanda PENDING REVISI yang dilepas.
UPDATE public.master_pelanggaran
   SET catatan = NULL
 WHERE jalur = 'spv' AND nomor = 20;

-- ── 2. Kolom berlaku_mulai + unique per versi ───────────────
ALTER TABLE public.aturan_config
  ADD COLUMN IF NOT EXISTS berlaku_mulai date NOT NULL DEFAULT DATE '1970-01-01';

ALTER TABLE public.aturan_config DROP CONSTRAINT IF EXISTS aturan_config_jalur_kunci_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aturan_config_jalur_kunci_berlaku_key'
  ) THEN
    ALTER TABLE public.aturan_config
      ADD CONSTRAINT aturan_config_jalur_kunci_berlaku_key UNIQUE (jalur, kunci, berlaku_mulai);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aturan_config_lookup
  ON public.aturan_config (jalur, kunci, berlaku_mulai DESC);

-- Nilai dari 6 dokumen baru hanya berlaku mulai 1 September 2026.
-- Kunci lain (kompensasi, vesting, kasbon, jadwal SPV, dst) tetap
-- 1970-01-01 karena tidak menggantikan aturan lama yang sedang jalan.
UPDATE public.aturan_config
   SET berlaku_mulai = DATE '2026-09-01'
 WHERE kunci IN ('telat', 'izin', 'sakit', 'sp')
   AND berlaku_mulai = DATE '1970-01-01';

-- ── 3. Seed nominal LAMA (berlaku sampai 31 Agustus 2026) ───
-- Persis seperti perilaku src/lib/absensi.ts & src/lib/izin.ts saat ini,
-- supaya periode berjalan tidak berubah sedikit pun.
INSERT INTO public.aturan_config (jalur, kunci, label, berlaku_mulai, nilai)
SELECT j.jalur, 'telat', 'Keterlambatan — berlaku s/d 31 Agu 2026', DATE '1970-01-01', '{
  "dispensasi_k1_per_bulan": 3,
  "destinasi_denda": "denda_tunai",
  "kategori": [
    {"kode":"K1","menit_min":1,"menit_maks":15,"poin":0.5,"denda":10000},
    {"kode":"K2","menit_min":16,"menit_maks":45,"poin":1,"denda":20000},
    {"kode":"K3","menit_min":46,"menit_maks":null,"poin":3,"denda":30000}
  ]
}'::jsonb
FROM (VALUES ('training'), ('staff'), ('spv')) AS j(jalur)
ON CONFLICT (jalur, kunci, berlaku_mulai) DO NOTHING;

INSERT INTO public.aturan_config (jalur, kunci, label, berlaku_mulai, nilai)
SELECT j.jalur, 'izin', 'Izin Tidak Hadir — berlaku s/d 31 Agu 2026', DATE '1970-01-01', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":3},
  "tepat_waktu":         {"denda":150000,"poin":0},
  "telat_sebelum_shift": {"denda":200000,"poin":0},
  "setelah_shift":       {"denda":300000,"poin":0},
  "alpha":               {"denda":200000,"poin":5},
  "kuota_izin_per_hari": 1,
  "denda_tambahan_kuota_penuh": 100000,
  "destinasi_denda": "denda_tunai"
}'::jsonb
FROM (VALUES ('training'), ('staff'), ('spv')) AS j(jalur)
ON CONFLICT (jalur, kunci, berlaku_mulai) DO NOTHING;

INSERT INTO public.aturan_config (jalur, kunci, label, berlaku_mulai, nilai)
SELECT j.jalur, 'sakit', 'Izin Sakit — berlaku s/d 31 Agu 2026', DATE '1970-01-01', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":3},
  "batas_kirim_surat_jam": "20:00",
  "tepat_waktu_bersurat": {"denda":0,"poin":0},
  "telat_sebelum_shift":  {"denda":25000,"poin":0},
  "setelah_shift":        {"denda":50000,"poin":0},
  "bebas_denda_berlaku_semua_kejadian": false,
  "tanpa_surat_ikut_aturan_izin": false,
  "tambahan_poin_sakit_berulang": {"mulai_kejadian_ke":9999,"poin":0,"maks_per_bulan":0},
  "destinasi_denda": "denda_tunai"
}'::jsonb
FROM (VALUES ('training'), ('staff'), ('spv')) AS j(jalur)
ON CONFLICT (jalur, kunci, berlaku_mulai) DO NOTHING;

INSERT INTO public.aturan_config (jalur, kunci, label, berlaku_mulai, nilai)
SELECT j.jalur, 'sp', 'Threshold SP — berlaku s/d 31 Agu 2026', DATE '1970-01-01', '{
  "thresholds": [{"level":1,"poin":5},{"level":2,"poin":10},{"level":3,"poin":15}],
  "carry_over_antar_kuartal": true,
  "reset_poin_per_kuartal": true,
  "sp_ikut_reset": false,
  "tutup_sp_setelah_kuartal_bersih": 2,
  "phk_otomatis": false
}'::jsonb
FROM (VALUES ('training'), ('staff'), ('spv')) AS j(jalur)
ON CONFLICT (jalur, kunci, berlaku_mulai) DO NOTHING;

SELECT jalur, kunci, berlaku_mulai, label
  FROM public.aturan_config
 WHERE kunci IN ('telat','izin','sakit','sp')
 ORDER BY jalur, kunci, berlaku_mulai;
