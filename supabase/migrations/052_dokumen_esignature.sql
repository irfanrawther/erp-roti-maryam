-- ============================================================
-- 052_dokumen_esignature.sql
-- Dokumen HR + e-signature. Bukti low-stakes: kekuatan di audit trail
-- (siapa, kapan, versi mana), bukan gambar TTD.
-- ============================================================

create table if not exists public.dokumen (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null,
  file_pdf_url text,
  versi        integer not null default 1,
  wajib_ttd    boolean not null default true,
  is_aktif     boolean not null default true,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);

create table if not exists public.dokumen_persetujuan (
  id              uuid primary key default gen_random_uuid(),
  dokumen_id      uuid references public.dokumen(id) on delete cascade,
  dokumen_versi   integer not null,
  karyawan_id     uuid references public.karyawan(id) on delete cascade,
  tipe            text not null,                    -- 'ttd' | 'baca_saja'
  tanda_tangan_url text,
  scroll_selesai  boolean not null default false,
  disetujui_at    timestamptz not null default now(),
  unique (dokumen_id, dokumen_versi, karyawan_id)
);

create index if not exists idx_dok_persetujuan_karyawan on public.dokumen_persetujuan (karyawan_id);
create index if not exists idx_dok_persetujuan_dok on public.dokumen_persetujuan (dokumen_id, dokumen_versi);

alter table public.dokumen enable row level security;
alter table public.dokumen_persetujuan enable row level security;

drop policy if exists "dokumen_all" on public.dokumen;
create policy "dokumen_all" on public.dokumen for all to authenticated, anon using (true) with check (true);
drop policy if exists "dokumen_persetujuan_all" on public.dokumen_persetujuan;
create policy "dokumen_persetujuan_all" on public.dokumen_persetujuan for all to authenticated, anon using (true) with check (true);

-- Bucket "dokumen" (PDF) — public read + insert anon. TTD pakai bucket foto-absensi (folder ttd/).
insert into storage.buckets (id, name, public) values ('dokumen', 'dokumen', true)
on conflict (id) do nothing;

drop policy if exists "dokumen_read"   on storage.objects;
create policy "dokumen_read"   on storage.objects for select to authenticated, anon using (bucket_id = 'dokumen');
drop policy if exists "dokumen_insert" on storage.objects;
create policy "dokumen_insert" on storage.objects for insert to authenticated, anon with check (bucket_id = 'dokumen');
drop policy if exists "dokumen_delete" on storage.objects;
create policy "dokumen_delete" on storage.objects for delete to authenticated, anon using (bucket_id = 'dokumen');

select 'dokumen tables created' as info;
