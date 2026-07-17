-- ============================================================
-- 055_poin_pelanggaran.sql
-- Sistem Poin Pelanggaran: SPV lapor → Super Admin review → poin.
-- Telat & reject basi otomatis. Reset per kuartal, SP akumulatif.
-- Tier 4 (insiden berat) TERPISAH, tanpa poin.
-- ============================================================

create table if not exists public.master_pelanggaran (
  id                uuid primary key default gen_random_uuid(),
  nama_pelanggaran  text not null,
  poin              numeric not null default 0,
  tier              text not null,            -- 'tier1' | 'tier2' | 'tier3'
  jenis             text not null,            -- 'otomatis' | 'manual'
  is_aktif          boolean not null default true
);

create table if not exists public.laporan_pelanggaran (
  id              uuid primary key default gen_random_uuid(),
  karyawan_id     uuid references public.karyawan(id) on delete cascade,
  pelanggaran_id  uuid references public.master_pelanggaran(id),
  tanggal_kejadian date not null,
  dilaporkan_oleh text,
  keterangan      text,
  foto_bukti_url  text,
  status          text not null default 'pending',  -- pending | diterima | ditolak
  direview_oleh   text,
  direview_at     timestamptz,
  catatan_review  text,
  created_at      timestamptz not null default now()
);

create table if not exists public.poin_karyawan (
  id              uuid primary key default gen_random_uuid(),
  karyawan_id     uuid references public.karyawan(id) on delete cascade,
  pelanggaran_id  uuid references public.master_pelanggaran(id),
  laporan_id      uuid references public.laporan_pelanggaran(id) on delete set null,
  poin            numeric not null default 0,
  sumber          text not null,             -- 'manual' | 'otomatis'
  tanggal         date not null,
  kuartal         text not null,             -- '2026-Q3'
  catatan         text,
  created_at      timestamptz not null default now()
);

create table if not exists public.status_sp_karyawan (
  id              uuid primary key default gen_random_uuid(),
  karyawan_id     uuid references public.karyawan(id) on delete cascade,
  level_sp        integer not null,          -- 1 | 2 | 3
  poin_saat_kena  numeric,
  kuartal_kena    text,
  tanggal_sp      date not null,
  is_aktif        boolean not null default true,
  catatan         text
);

create table if not exists public.laporan_insiden_berat (
  id              uuid primary key default gen_random_uuid(),
  karyawan_id     uuid references public.karyawan(id) on delete cascade,
  jenis_insiden   text not null,
  tanggal_kejadian date not null,
  dilaporkan_oleh text,
  keterangan      text,
  foto_bukti_url  text,
  status          text not null default 'pending',  -- pending | ditindaklanjuti | selesai
  created_at      timestamptz not null default now()
);

create index if not exists idx_poin_karyawan_kuartal on public.poin_karyawan (karyawan_id, kuartal);
create index if not exists idx_laporan_pelanggaran_status on public.laporan_pelanggaran (status);

-- RLS
do $$ declare t text; begin
  foreach t in array array['master_pelanggaran','laporan_pelanggaran','poin_karyawan','status_sp_karyawan','laporan_insiden_berat'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%I_all" on public.%I', t, t);
    execute format('create policy "%I_all" on public.%I for all to authenticated, anon using (true) with check (true)', t, t);
  end loop;
end $$;

-- Seed master pelanggaran (skip jika sudah ada)
insert into public.master_pelanggaran (nama_pelanggaran, poin, tier, jenis)
select * from (values
  -- TIER 1
  ('Peralatan tidak dikembalikan ke tempat yang ditentukan', 0.5, 'tier1', 'manual'),
  ('Pasang musik di area kerja saat jam kerja aktif', 0.5, 'tier1', 'manual'),
  ('Penggunaan HP untuk keperluan pribadi di area produksi', 0.5, 'tier1', 'manual'),
  ('Seragam/atribut/shower cap tidak lengkap saat masuk shift', 0.5, 'tier1', 'manual'),
  ('Tidak melaporkan hasil produksi/reject ke grup tepat waktu', 0.5, 'tier1', 'manual'),
  ('Terlambat Kategori 1 (1-15 menit)', 0.5, 'tier1', 'otomatis'),
  ('Reject basi (bukan reject teknikal)', 0.5, 'tier1', 'otomatis'),
  ('Area kerja tidak dibersihkan sebelum/sesudah shift', 1, 'tier1', 'manual'),
  ('Membersihkan area/peralatan tidak sesuai ketentuan', 1, 'tier1', 'manual'),
  ('Tidak cuci tangan sebelum bekerja atau setelah dari toilet', 1, 'tier1', 'manual'),
  ('Kuku panjang atau memakai hiasan kuku di area produksi', 1, 'tier1', 'manual'),
  ('Terlambat Kategori 2 (16-45 menit)', 1, 'tier1', 'otomatis'),
  -- TIER 2
  ('Makan atau minum di area produksi aktif', 2, 'tier2', 'manual'),
  ('Memakai aksesoris (gelang, jam tangan, cincin, dll) di area produksi', 2, 'tier2', 'manual'),
  ('Berbicara kasar atau tidak sopan kepada rekan kerja atau SPV (ada saksi)', 2, 'tier2', 'manual'),
  ('Jobdesk tidak dikerjakan', 2, 'tier2', 'manual'),
  ('Tidak patuh instruksi SPV setelah teguran lisan pertama', 2, 'tier2', 'manual'),
  ('Tidur di area produksi saat jam kerja aktif', 3, 'tier2', 'manual'),
  ('Meninggalkan area produksi tanpa izin SPV saat jam kerja aktif', 3, 'tier2', 'manual'),
  ('Merokok di area produksi atau area yang tidak diizinkan', 3, 'tier2', 'manual'),
  ('Mengoperasikan mesin di luar jobdesk tanpa izin SPV', 3, 'tier2', 'manual'),
  ('Terlambat Kategori 3 (lebih dari 45 menit)', 3, 'tier2', 'otomatis'),
  -- TIER 3
  ('Tidak hadir tanpa memberi kabar sama sekali', 5, 'tier3', 'manual'),
  ('Berulang kali tidak patuh instruksi SPV setelah teguran tertulis', 5, 'tier3', 'manual'),
  ('Merusak peralatan/mesin akibat kelalaian yang dapat dibuktikan', 5, 'tier3', 'manual'),
  ('Membawa orang luar ke area produksi tanpa izin', 5, 'tier3', 'manual'),
  ('Intimidasi verbal secara sengaja kepada rekan/atasan (ada bukti/saksi)', 5, 'tier3', 'manual'),
  ('Membocorkan informasi rahasia perusahaan kepada pihak luar', 5, 'tier3', 'manual')
) as v(nama_pelanggaran, poin, tier, jenis)
where not exists (select 1 from public.master_pelanggaran m where m.nama_pelanggaran = v.nama_pelanggaran);

select count(*) as total_master from public.master_pelanggaran;
