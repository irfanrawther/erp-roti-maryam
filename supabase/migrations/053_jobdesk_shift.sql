-- ============================================================
-- 053_jobdesk_shift.sql
-- Jobdesk per shift untuk Dashboard Pribadi Karyawan.
-- ============================================================

create table if not exists public.jobdesk_shift (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid unique references public.shift_master(id) on delete cascade,
  jobdesk_awal  text,
  jobdesk_akhir text,
  updated_by    text,
  updated_at    timestamptz not null default now()
);

alter table public.jobdesk_shift enable row level security;
drop policy if exists "jobdesk_shift_all" on public.jobdesk_shift;
create policy "jobdesk_shift_all" on public.jobdesk_shift for all to authenticated, anon using (true) with check (true);

-- Seed kosong per shift (Super Admin isi nanti)
insert into public.jobdesk_shift (shift_id, jobdesk_awal, jobdesk_akhir)
select id, null, null from public.shift_master
on conflict (shift_id) do nothing;

select 'jobdesk_shift created' as info;
