-- ============================================================
-- 043_selisih_packing.sql
-- Catatan selisih antara total direndam (Nofita) vs total aktual
-- packing (Adam). Dipakai untuk notifikasi review Super Admin.
-- ============================================================

create table if not exists public.selisih_packing (
  id                uuid primary key default gen_random_uuid(),
  batch_packing_id  uuid references public.batch_produksi(id) on delete cascade,
  brand             text not null,
  varian            text not null,
  total_direndam    integer not null default 0,
  total_aktual      integer not null default 0,
  selisih_pcs       integer not null default 0,   -- bisa negatif (aktual < rendam)
  catatan           text,
  nama_user         text,
  status_review     text not null default 'pending',  -- 'pending' | 'reviewed'
  reviewed_by       text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_selisih_packing_status on public.selisih_packing (status_review);
create index if not exists idx_selisih_packing_batch  on public.selisih_packing (batch_packing_id);

alter table public.selisih_packing enable row level security;

drop policy if exists "selisih_packing_all" on public.selisih_packing;
create policy "selisih_packing_all" on public.selisih_packing
  for all using (true) with check (true);
