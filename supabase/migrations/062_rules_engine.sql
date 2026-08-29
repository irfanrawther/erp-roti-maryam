-- ============================================================
-- 062_rules_engine.sql
-- Rules engine berbasis config untuk 3 jalur kepegawaian
-- (Training / Staff / SPV), bersumber dari 6 dokumen:
--   PK+PP Training, PK+PP Staff, PK+PP SPV.
--
-- SEMUA angka (denda, poin, tier, threshold SP, vesting,
-- tunjangan, jam tugas SPV) disimpan sebagai data — bukan
-- hardcode — supaya bisa diubah dari admin panel tanpa deploy.
--
-- Riwayat lama DIPERTAHANKAN: baris master_pelanggaran yang
-- sudah dirujuk poin_karyawan tidak dihapus, hanya ditandai
-- jalur='legacy' + is_aktif=false.
-- ============================================================

-- ── 1. Tabel config aturan ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aturan_config (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  jalur      text        NOT NULL,   -- 'global' | 'training' | 'staff' | 'spv'
  kunci      text        NOT NULL,   -- 'telat' | 'izin' | 'sakit' | 'sp' | ...
  label      text,                   -- judul human-readable utk admin panel
  nilai      jsonb       NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jalur, kunci)
);

ALTER TABLE public.aturan_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aturan_config_all" ON public.aturan_config;
CREATE POLICY "aturan_config_all" ON public.aturan_config
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Audit perubahan aturan (siapa ubah apa, kapan)
CREATE TABLE IF NOT EXISTS public.aturan_config_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id   uuid        REFERENCES public.aturan_config(id) ON DELETE SET NULL,
  jalur       text,
  kunci       text,
  nilai_lama  jsonb,
  nilai_baru  jsonb,
  diubah_oleh text,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aturan_config_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aturan_config_log_all" ON public.aturan_config_log;
CREATE POLICY "aturan_config_log_all" ON public.aturan_config_log
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- ── 2. Perluas master_pelanggaran ───────────────────────────
ALTER TABLE public.master_pelanggaran
  ADD COLUMN IF NOT EXISTS jalur         text    NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS nomor         integer,
  ADD COLUMN IF NOT EXISTS is_kebersihan boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_kolektif   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eskalasi_poin numeric,
  ADD COLUMN IF NOT EXISTS catatan       text;

-- Baris lama: pensiunkan tapi JANGAN dihapus (dirujuk poin_karyawan).
UPDATE public.master_pelanggaran
   SET jalur = 'legacy', is_aktif = false
 WHERE jalur = 'legacy';

CREATE INDEX IF NOT EXISTS idx_master_pelanggaran_jalur
  ON public.master_pelanggaran (jalur, is_aktif);

-- ── 3. Seed tabel pelanggaran per jalur ─────────────────────
-- Training & Staff: 30 item identik (PP Training Pasal 4 / PP Staff Pasal 4)
INSERT INTO public.master_pelanggaran
  (jalur, nomor, nama_pelanggaran, poin, tier, jenis, is_aktif, is_kebersihan, is_kolektif, eskalasi_poin, catatan)
SELECT j.jalur, v.nomor, v.nama, v.poin, v.tier, v.jenis, true, v.kebersihan, v.kolektif, v.eskalasi, v.catatan
FROM (VALUES ('training'), ('staff')) AS j(jalur)
CROSS JOIN (VALUES
  (1,  'Peralatan tidak dikembalikan ke tempat yang ditentukan',                                   0.5, 'tier1', 'manual',   false, false, NULL::numeric, NULL::text),
  (2,  'Pasang musik di area kerja saat jam kerja aktif',                                          0.5, 'tier1', 'manual',   false, false, NULL, NULL),
  (3,  'Penggunaan HP untuk keperluan pribadi di area produksi saat jam kerja aktif',              0.5, 'tier1', 'manual',   false, false, NULL, NULL),
  (4,  'Tidak memakai atribut/shower cap saat shift berjalan',                                     0.5, 'tier1', 'manual',   false, false, NULL, NULL),
  (5,  'Tidak melaporkan hasil produksi/reject ke SPV tepat waktu',                                0.5, 'tier1', 'manual',   false, false, NULL, NULL),
  (6,  'Terlambat Kategori 1 (1-15 menit)',                                                        0.5, 'tier1', 'otomatis', false, false, NULL, NULL),
  (7,  'Menyimpan barang pribadi selain minuman kemasan botol di kulkas produksi',                 1,   'tier1', 'manual',   false, false, NULL, NULL),
  (8,  'Tidak membersihkan area/peralatan kerja sesuai ketentuan sebelum & sesudah shift',         1,   'tier1', 'manual',   true,  false, NULL, 'Pelanggaran kebersihan: ke-3 dst dalam 1 periode gaji menghanguskan Tunjangan Kebersihan (Staff/SPV)'),
  (9,  'Tidak cuci tangan sebelum bekerja atau setelah dari toilet',                               1,   'tier1', 'manual',   false, false, NULL, NULL),
  (10, 'Kuku panjang atau memakai aksesoris (gelang, cincin, jam, dll) di area produksi',          1,   'tier1', 'manual',   false, false, NULL, NULL),
  (11, 'Terlambat Kategori 2 (16-45 menit)',                                                       1,   'tier1', 'otomatis', false, false, NULL, NULL),
  (12, 'Tidak menjaga kebersihan atribut produksi sesuai ketentuan (apron, shower cap, dll)',      1,   'tier1', 'manual',   false, false, NULL, NULL),
  (13, 'Adonan & bahan basi atau rusak akibat kelalaian (dibagi rata ke shift, dibulatkan 0,5/orang)', 0.5, 'tier1', 'manual', false, true, NULL, 'Kolektif: SPV menentukan manual siapa saja yang kena dan berapa poin per orang'),
  (14, 'Dengan sengaja melakukan aktivitas yang berpotensi merusak alat/mesin produksi',           2,   'tier2', 'manual',   false, false, NULL, NULL),
  (15, 'Makan atau minum di area produksi aktif',                                                  2,   'tier2', 'manual',   false, false, NULL, NULL),
  (16, 'Tidak mengerjakan jobdesk yang sudah ditentukan',                                          2,   'tier2', 'manual',   false, false, NULL, NULL),
  (17, 'Tidak patuh instruksi SPV secara keseluruhan',                                             2,   'tier2', 'manual',   false, false, NULL, NULL),
  (18, 'Menolak penempatan atau perubahan shift sesuai penugasan SPV tanpa alasan yang sah',       2,   'tier2', 'manual',   false, false, NULL, NULL),
  (19, 'Menolak penugasan membimbing karyawan training tanpa alasan yang sah',                     2,   'tier2', 'manual',   false, false, NULL, 'Hanya bagi karyawan yang BELUM memenuhi syarat masa kerja Tunjangan Loyalitas; yang sudah memenuhi syarat kehilangan Tunjangan Loyalitas periode tsb, bukan poin ini'),
  (20, 'Tidur di area produksi saat jam kerja aktif (pelanggaran pertama)',                        2,   'tier2', 'manual',   false, false, 3,    'Pelanggaran berikutnya dalam kuartal yang sama: 3 poin per kejadian (PP Pasal 7)'),
  (21, 'Berbicara kasar atau tidak sopan kepada rekan kerja atau SPV',                             2,   'tier2', 'manual',   false, false, NULL, NULL),
  (22, 'Terlambat Kategori 3 (lebih dari 45 menit)',                                               2,   'tier2', 'otomatis', false, false, NULL, NULL),
  (23, 'Meninggalkan area produksi tanpa izin SPV/Manajer Operasional saat jam kerja aktif',       3,   'tier2', 'manual',   false, false, NULL, NULL),
  (24, 'Merokok di area produksi atau area yang tidak diizinkan',                                  3,   'tier2', 'manual',   false, false, NULL, NULL),
  (25, 'Mengoperasikan mesin di luar jobdesk tanpa izin SPV',                                      3,   'tier2', 'manual',   false, false, NULL, NULL),
  (26, 'Membocorkan informasi rahasia perusahaan kepada pihak luar',                               5,   'tier3', 'manual',   false, false, NULL, NULL),
  (27, 'Berulang kali tidak patuh instruksi SPV setelah teguran tertulis',                         5,   'tier3', 'manual',   false, false, NULL, NULL),
  (28, 'Merusak peralatan/mesin akibat kelalaian yang dapat dibuktikan',                           5,   'tier3', 'manual',   false, false, NULL, NULL),
  (29, 'Membawa orang luar ke area produksi tanpa izin',                                           5,   'tier3', 'manual',   false, false, NULL, NULL),
  (30, 'Intimidasi verbal secara sengaja kepada rekan/atasan',                                     5,   'tier3', 'manual',   false, false, NULL, NULL)
) AS v(nomor, nama, poin, tier, jenis, kebersihan, kolektif, eskalasi, catatan)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_pelanggaran m WHERE m.jalur = j.jalur AND m.nomor = v.nomor
);

-- SPV: 27 item pelanggaran umum (PP SPV Pasal 4)
INSERT INTO public.master_pelanggaran
  (jalur, nomor, nama_pelanggaran, poin, tier, jenis, is_aktif, is_kebersihan, is_kolektif, eskalasi_poin, catatan)
SELECT 'spv', v.nomor, v.nama, v.poin, v.tier, v.jenis, true, v.kebersihan, false, v.eskalasi, v.catatan
FROM (VALUES
  (1,  'Peralatan tidak dikembalikan ke tempat yang ditentukan',                              0.5, 'tier1', 'manual',   false, NULL::numeric, NULL::text),
  (2,  'Pasang musik di area kerja saat jam kerja aktif',                                     0.5, 'tier1', 'manual',   false, NULL, NULL),
  (3,  'Penggunaan HP untuk keperluan pribadi di area produksi saat jam kerja aktif',         0.5, 'tier1', 'manual',   false, NULL, NULL),
  (4,  'Tidak memakai atribut/shower cap saat shift berjalan',                                0.5, 'tier1', 'manual',   false, NULL, NULL),
  (5,  'Terlambat Kategori 1 (1-15 menit)',                                                   0.5, 'tier1', 'otomatis', false, NULL, NULL),
  (6,  'Menyimpan barang pribadi selain minuman kemasan botol di kulkas produksi',            1,   'tier1', 'manual',   false, NULL, NULL),
  (7,  'Tidak membersihkan area/peralatan kerja sesuai ketentuan sebelum & sesudah shift',    1,   'tier1', 'manual',   true,  NULL, 'Pelanggaran kebersihan: ke-3 dst dalam 1 periode gaji menghanguskan Tunjangan Kebersihan'),
  (8,  'Tidak cuci tangan sebelum bekerja atau setelah dari toilet',                          1,   'tier1', 'manual',   false, NULL, NULL),
  (9,  'Kuku panjang atau memakai aksesoris (gelang, cincin, jam, dll) di area produksi',     1,   'tier1', 'manual',   false, NULL, NULL),
  (10, 'Terlambat Kategori 2 (16-45 menit)',                                                  1,   'tier1', 'otomatis', false, NULL, NULL),
  (11, 'Tidak menjaga kebersihan atribut produksi sesuai ketentuan (apron, shower cap, dll)', 1,   'tier1', 'manual',   false, NULL, NULL),
  (12, 'Dengan sengaja melakukan aktivitas yang berpotensi merusak alat/mesin produksi',      2,   'tier2', 'manual',   false, NULL, NULL),
  (13, 'Makan atau minum di area produksi aktif',                                             2,   'tier2', 'manual',   false, NULL, NULL),
  (14, 'Tidak mengerjakan jobdesk yang sudah ditentukan',                                     2,   'tier2', 'manual',   false, NULL, NULL),
  (15, 'Tidak patuh instruksi Manajer Operasional secara keseluruhan',                        2,   'tier2', 'manual',   false, NULL, NULL),
  (16, 'Menolak penempatan atau perubahan shift sesuai penugasan Manajer Operasional',        2,   'tier2', 'manual',   false, NULL, NULL),
  (17, 'Tidur di area produksi saat jam kerja aktif (pelanggaran pertama)',                   2,   'tier2', 'manual',   false, 3,    'Pelanggaran berikutnya dalam kuartal yang sama: 3 poin per kejadian (PP Pasal 7)'),
  (18, 'Berbicara kasar atau tidak sopan kepada rekan kerja atau SPV',                        2,   'tier2', 'manual',   false, NULL, NULL),
  (19, 'Terlambat Kategori 3 (lebih dari 45 menit)',                                          2,   'tier2', 'otomatis', false, NULL, NULL),
  (20, 'Meninggalkan area produksi tanpa izin SPV/Manajer Operasional saat jam kerja aktif',  3,   'tier2', 'manual',   false, NULL, 'PENDING REVISI: subjek "SPV" menunggu konfirmasi diubah jadi "Manajer Operasional"'),
  (21, 'Merokok di area produksi atau area yang tidak diizinkan',                             3,   'tier2', 'manual',   false, NULL, NULL),
  (22, 'Mengoperasikan mesin di luar jobdesk tanpa izin SPV',                                 3,   'tier2', 'manual',   false, NULL, 'PENDING REVISI: subjek "SPV" menunggu konfirmasi diubah jadi "Manajer Operasional"'),
  (23, 'Membocorkan informasi rahasia perusahaan kepada pihak luar',                          5,   'tier3', 'manual',   false, NULL, NULL),
  (24, 'Berulang kali tidak patuh instruksi SPV setelah teguran tertulis',                    5,   'tier3', 'manual',   false, NULL, 'PENDING REVISI: subjek "SPV" menunggu konfirmasi diubah jadi "Manajer Operasional"'),
  (25, 'Merusak peralatan/mesin akibat kelalaian yang dapat dibuktikan',                      5,   'tier3', 'manual',   false, NULL, NULL),
  (26, 'Membawa orang luar ke area produksi tanpa izin',                                      5,   'tier3', 'manual',   false, NULL, NULL),
  (27, 'Intimidasi verbal secara sengaja kepada rekan/atasan',                                5,   'tier3', 'manual',   false, NULL, NULL)
) AS v(nomor, nama, poin, tier, jenis, kebersihan, eskalasi, catatan)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_pelanggaran m WHERE m.jalur = 'spv' AND m.nomor = v.nomor
);

-- SPV khusus: 13 item (PP SPV Pasal 12 ayat 2). Ditetapkan langsung oleh Manajer Operasional.
INSERT INTO public.master_pelanggaran
  (jalur, nomor, nama_pelanggaran, poin, tier, jenis, is_aktif, catatan)
SELECT 'spv_khusus', v.nomor, v.nama, v.poin, 'khusus', 'manual', true, 'Per kejadian. Penetapan poin langsung oleh Manajer Operasional (PP SPV Pasal 12 ayat 3).'
FROM (VALUES
  (1,  'Laporan produksi/reject terlambat (setelah batas waktu, sebelum shift berikutnya dimulai)', 0.5),
  (2,  'Melaksanakan audit kebersihan namun melewati jam yang ditetapkan',                          0.5),
  (3,  'Tidak melakukan briefing/pengarahan sebelum shift dimulai',                                 1),
  (4,  'Kegagalan pengawasan yang mengakibatkan kerugian produksi',                                 1),
  (5,  'Tidak melaksanakan audit kebersihan sama sekali hingga jadwal audit berikutnya tiba',       2),
  (6,  'Tidak melaporkan produksi/reject sama sekali hingga shift berikutnya dimulai',              2),
  (7,  'Tidak melaporkan pelanggaran karyawan yang diketahui',                                      3),
  (8,  'Membiarkan pelanggaran karyawan terjadi di depan mata tanpa ditindak/dicatat',              3),
  (9,  'Tidak melaporkan kerusakan alat/mesin yang diketahui',                                      3),
  (10, 'Dengan sengaja memanipulasi data laporan produksi/reject agar tidak sesuai fakta',          5),
  (11, 'Terbukti pilih kasih dalam pelaksanaan peraturan (ada bukti atau saksi)',                   5),
  (12, 'Menyalahgunakan wewenang untuk kepentingan pribadi',                                        5),
  (13, 'Tidak berkoordinasi menyiapkan pengganti saat mengetahui akan berhalangan hadir',           5)
) AS v(nomor, nama, poin)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_pelanggaran m WHERE m.jalur = 'spv_khusus' AND m.nomor = v.nomor
);

-- Tier 4 — PHK langsung tanpa sistem poin (berlaku semua jalur)
INSERT INTO public.master_pelanggaran
  (jalur, nomor, nama_pelanggaran, poin, tier, jenis, is_aktif, catatan)
SELECT 'tier4', v.nomor, v.nama, 0, 'tier4', 'manual', true,
       'PHK langsung tanpa melalui sistem poin dan SP, tetap tunduk prosedur hukum yang berlaku.'
FROM (VALUES
  (1, 'Datang dalam kondisi mabuk atau terpengaruh narkoba'),
  (2, 'Memalsukan absensi karyawan lain'),
  (3, 'Pencurian signifikan'),
  (4, 'Kekerasan fisik'),
  (5, 'Sabotase produksi secara sengaja'),
  (6, 'Pemalsuan data produksi/bahan secara sengaja')
) AS v(nomor, nama)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_pelanggaran m WHERE m.jalur = 'tier4' AND m.nomor = v.nomor
);

-- ── 4. Seed config aturan ───────────────────────────────────
INSERT INTO public.aturan_config (jalur, kunci, label, nilai) VALUES

('global', 'umum', 'Ketentuan Umum', '{
  "hari_kerja": ["senin","selasa","rabu","kamis","jumat","sabtu"],
  "hari_libur_mingguan": "minggu",
  "kuartal_reset_bulan": [1,4,7,10],
  "periode_gaji": {"buka":1, "tutup":"akhir_bulan", "dibayar_tanggal":10},
  "libur_idul_fitri": {"dari":"H-2","sampai":"H+2"},
  "cuti_pernikahan_hari": 3,
  "notice_period_hari": 30
}'::jsonb),

('global', 'alur_pelanggaran', 'Alur Pencatatan Poin (Pasal 6)', '{
  "lapor_ke_manajer_maks_jam": 24,
  "notifikasi_karyawan_maks_jam": 48,
  "tanpa_klarifikasi_dianggap_setuju": true,
  "penetapan_final_oleh": "manajer_operasional"
}'::jsonb),

('global', 'potongan_upah', 'Batas Potongan Upah', '{
  "kasbon_didahulukan": true,
  "sisa_jadi_utang_periode_berikutnya": true,
  "upah_pokok_tidak_boleh_dipotong": true
}'::jsonb),

-- ── TRAINING ──
('training', 'telat', 'Keterlambatan — Training', '{
  "dispensasi_k1_per_bulan": 3,
  "destinasi_denda": "bonus_vesting",
  "kategori": [
    {"kode":"K1","menit_min":1,"menit_maks":15,"poin":0.5,"denda":10000},
    {"kode":"K2","menit_min":16,"menit_maks":45,"poin":1,"denda":20000},
    {"kode":"K3","menit_min":46,"menit_maks":null,"poin":2,"denda":40000}
  ]
}'::jsonb),

('training', 'izin', 'Izin Tidak Hadir (bukan sakit) — Training', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "tepat_waktu":         {"denda":50000,"poin":0},
  "telat_sebelum_shift": {"denda":75000,"poin":2},
  "setelah_shift":       {"denda":150000,"poin":3},
  "alpha":               {"denda":0,"poin":10},
  "kuota_izin_per_hari": 1,
  "denda_tambahan_kuota_penuh": 100000,
  "destinasi_denda": "bonus_vesting"
}'::jsonb),

('training', 'sakit', 'Izin Sakit — Training', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "batas_kirim_surat_jam": "20:00",
  "tepat_waktu_bersurat": {"denda":0,"poin":0},
  "telat_sebelum_shift":  {"denda":25000,"poin":0.5},
  "setelah_shift":        {"denda":100000,"poin":1},
  "bebas_denda_berlaku_semua_kejadian": true,
  "tanpa_surat_ikut_aturan_izin": true,
  "tambahan_poin_sakit_berulang": {"mulai_kejadian_ke":3,"poin":1,"maks_per_bulan":1},
  "destinasi_denda": "bonus_vesting"
}'::jsonb),

('training', 'sp', 'Threshold Surat Peringatan — Training', '{
  "thresholds": [{"level":1,"poin":5},{"level":2,"poin":10},{"level":3,"poin":15}],
  "carry_over_antar_kuartal": false,
  "reset_poin_per_kuartal": true,
  "sp_ikut_reset": false,
  "tutup_sp_setelah_kuartal_bersih": 2,
  "phk_otomatis": false
}'::jsonb),

('training', 'kompensasi', 'Kompensasi — Training', '{
  "upah_pokok": 1500000,
  "hari_standar": 26,
  "masa_training_hari_kalender": 90,
  "hari_hadir_dihitung": "checkin_fisik"
}'::jsonb),

('training', 'vesting', 'Bonus Penyelesaian Training', '{
  "tahap": [
    {"tahap":1,"nominal":500000,"hari_kalender":30},
    {"tahap":2,"nominal":600000,"hari_kalender":60},
    {"tahap":3,"nominal":600000,"hari_kalender":90}
  ],
  "mundur_hari_per_ketidakhadiran": 1,
  "ketidakhadiran_yang_menunda": ["izin","sakit","cuti","alpha"],
  "bayar_hari_kerja_berikutnya": true,
  "grace_phk_hari_kalender": 14,
  "hangus_saat_resign": true
}'::jsonb),

('training', 'kasbon', 'Kasbon — Training', '{
  "maks_persen_upah_pokok": 10,
  "maks_nominal": 150000,
  "diatas_maks_diperbolehkan": false,
  "perlu_persetujuan_tertulis_diatas": 150000
}'::jsonb),

-- ── STAFF ──
('staff', 'telat', 'Keterlambatan — Staff', '{
  "dispensasi_k1_per_bulan": 3,
  "destinasi_denda": "tunjangan_kerajinan",
  "kategori": [
    {"kode":"K1","menit_min":1,"menit_maks":15,"poin":0.5,"denda":10000},
    {"kode":"K2","menit_min":16,"menit_maks":45,"poin":1,"denda":20000},
    {"kode":"K3","menit_min":46,"menit_maks":null,"poin":2,"denda":40000}
  ]
}'::jsonb),

('staff', 'izin', 'Izin Tidak Hadir (bukan sakit) — Staff', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "tepat_waktu":         {"denda":50000,"poin":0},
  "telat_sebelum_shift": {"denda":75000,"poin":2},
  "setelah_shift":       {"denda":150000,"poin":3},
  "alpha":               {"denda":0,"poin":10},
  "kuota_izin_per_hari": 1,
  "denda_tambahan_kuota_penuh": 100000,
  "destinasi_denda": "tunjangan_kerajinan"
}'::jsonb),

('staff', 'sakit', 'Izin Sakit — Staff', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "batas_kirim_surat_jam": "20:00",
  "tepat_waktu_bersurat": {"denda":0,"poin":0},
  "telat_sebelum_shift":  {"denda":25000,"poin":0.5},
  "setelah_shift":        {"denda":100000,"poin":1},
  "bebas_denda_berlaku_semua_kejadian": true,
  "tanpa_surat_ikut_aturan_izin": true,
  "tambahan_poin_sakit_berulang": {"mulai_kejadian_ke":3,"poin":1,"maks_per_bulan":1},
  "destinasi_denda": "tunjangan_kerajinan"
}'::jsonb),

('staff', 'sp', 'Threshold Surat Peringatan — Staff', '{
  "thresholds": [{"level":1,"poin":5},{"level":2,"poin":10},{"level":3,"poin":15}],
  "carry_over_antar_kuartal": false,
  "reset_poin_per_kuartal": true,
  "sp_ikut_reset": false,
  "tutup_sp_setelah_kuartal_bersih": 2,
  "phk_otomatis": false,
  "sp2_hanguskan_tunjangan_prestasi": true
}'::jsonb),

('staff', 'kompensasi', 'Kompensasi — Staff', '{
  "upah_pokok": 1500000,
  "hari_standar": 26,
  "hari_hadir_dihitung": "checkin_fisik",
  "tunjangan_kerajinan": {"nominal":300000, "prorata":true, "minimum_nol":true, "sisa_denda_jadi_utang":true},
  "tunjangan_prestasi":  {"nominal":300000, "prorata":true, "hangus_jika_sp2_periode_ini":true},
  "tunjangan_kebersihan":{"nominal":200000, "prorata":true, "hangus_pada_pelanggaran_kebersihan_ke":3},
  "tunjangan_loyalitas": {
    "nominal_setelah_12_bulan":150000,
    "nominal_setelah_24_bulan":200000,
    "prorata":false,
    "min_kehadiran_persen":90,
    "basis_kehadiran":"hari_kerja_kalender",
    "hangus_jika_tolak_bimbing_training":true
  },
  "bonus_lebaran": {
    "per_bulan_kerja_penuh":50000,
    "maks_per_tahun":600000,
    "min_masa_kerja_bulan":6,
    "basis_bulan":"tanggal_mulai_kerja"
  }
}'::jsonb),

('staff', 'kasbon', 'Kasbon — Staff', '{
  "maks_persen_upah_pokok": 10,
  "maks_nominal": 150000,
  "diatas_maks_diperbolehkan": false,
  "perlu_persetujuan_tertulis_diatas": 150000
}'::jsonb),

('staff', 'plt_spv', 'Honor Pelaksana Tugas SPV — Staff', '{
  "honor_per_shift": 10000,
  "perlu_persetujuan_manajer": true
}'::jsonb),

-- ── SPV ──
('spv', 'telat', 'Keterlambatan — SPV', '{
  "dispensasi_k1_per_bulan": 3,
  "destinasi_denda": "tunjangan_kerajinan",
  "kategori": [
    {"kode":"K1","menit_min":1,"menit_maks":15,"poin":0.5,"denda":10000},
    {"kode":"K2","menit_min":16,"menit_maks":45,"poin":1,"denda":20000},
    {"kode":"K3","menit_min":46,"menit_maks":null,"poin":2,"denda":40000}
  ]
}'::jsonb),

('spv', 'izin', 'Izin Tidak Hadir (bukan sakit) — SPV', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "tepat_waktu":         {"denda":50000,"poin":0},
  "telat_sebelum_shift": {"denda":75000,"poin":2},
  "setelah_shift":       {"denda":150000,"poin":3},
  "alpha":               {"denda":0,"poin":10},
  "kuota_izin_per_hari": 1,
  "denda_tambahan_kuota_penuh": 100000,
  "destinasi_denda": "tunjangan_kerajinan"
}'::jsonb),

('spv', 'sakit', 'Izin Sakit — SPV', '{
  "jam_sebelum_by_shift": {"06:00":1,"08:00":2,"10:00":2,"13:00":5},
  "batas_kirim_surat_jam": "20:00",
  "tepat_waktu_bersurat": {"denda":0,"poin":0},
  "telat_sebelum_shift":  {"denda":25000,"poin":0.5},
  "setelah_shift":        {"denda":100000,"poin":1},
  "bebas_denda_berlaku_semua_kejadian": true,
  "tanpa_surat_ikut_aturan_izin": true,
  "tambahan_poin_sakit_berulang": {"mulai_kejadian_ke":3,"poin":1,"maks_per_bulan":1},
  "destinasi_denda": "tunjangan_kerajinan"
}'::jsonb),

('spv', 'sp', 'Threshold Surat Peringatan — SPV', '{
  "thresholds": [{"level":1,"poin":5},{"level":2,"poin":10},{"level":3,"poin":15}],
  "carry_over_antar_kuartal": false,
  "reset_poin_per_kuartal": true,
  "sp_ikut_reset": false,
  "tutup_sp_setelah_kuartal_bersih": 2,
  "phk_otomatis": false,
  "sp2_hanguskan_tunjangan_prestasi": true,
  "penetapan_poin_oleh": "manajer_operasional"
}'::jsonb),

('spv', 'kompensasi', 'Kompensasi — SPV', '{
  "upah_pokok": 1500000,
  "hari_standar": 26,
  "hari_hadir_dihitung": "checkin_fisik",
  "tunjangan_kerajinan": {"nominal":300000, "prorata":true, "minimum_nol":true, "sisa_denda_jadi_utang":true},
  "tunjangan_prestasi":  {"nominal":300000, "prorata":true, "hangus_jika_sp2_periode_ini":true},
  "tunjangan_kebersihan":{"nominal":200000, "prorata":true, "hangus_pada_pelanggaran_kebersihan_ke":3},
  "tunjangan_loyalitas": {
    "nominal_setelah_12_bulan":150000,
    "nominal_setelah_24_bulan":200000,
    "prorata":false,
    "min_kehadiran_persen":90,
    "basis_kehadiran":"hari_kerja_kalender",
    "hangus_jika_tolak_bimbing_training":true
  },
  "bonus_spv": {"nominal":150000, "prorata":false, "bersyarat":false},
  "bonus_lebaran": {
    "per_bulan_kerja_penuh":50000,
    "maks_per_tahun":600000,
    "min_masa_kerja_bulan":6,
    "basis_bulan":"tanggal_mulai_kerja"
  }
}'::jsonb),

('spv', 'kasbon', 'Kasbon — SPV', '{
  "maks_persen_upah_pokok": 10,
  "maks_nominal": 150000,
  "diatas_maks_diperbolehkan": false,
  "perlu_persetujuan_tertulis_diatas": 150000
}'::jsonb),

('spv', 'jadwal_tugas', 'Jadwal Tugas SPV (dapat diubah tanpa TTD ulang)', '{
  "audit_kebersihan": {"shift_pagi":"08:00","shift_malam":"19:00"},
  "lapor_produksi":   {"shift_pagi":"15:00","shift_malam":"03:00"},
  "lapor_pelanggaran_interval_jam": 3,
  "lapor_pelanggaran_maks_jam": 24,
  "dapat_diubah_tanpa_ttd_ulang": true,
  "dasar": "PP SPV Pasal 12 ayat 1"
}'::jsonb),

('spv', 'plt_spv', 'Mekanisme Pelaksana Tugas SPV', '{
  "honor_per_shift": 10000,
  "wajib_punya_pengganti_tetap": true,
  "pengganti_harus_lulus_training": true,
  "perlu_persetujuan_manajer": true,
  "aktivasi_tanpa_persetujuan_ulang": true
}'::jsonb)

ON CONFLICT (jalur, kunci) DO NOTHING;

SELECT
  (SELECT count(*) FROM public.aturan_config)                                  AS total_config,
  (SELECT count(*) FROM public.master_pelanggaran WHERE jalur <> 'legacy')     AS pelanggaran_baru,
  (SELECT count(*) FROM public.master_pelanggaran WHERE jalur =  'legacy')     AS pelanggaran_legacy;
