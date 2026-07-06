-- ============================================================
-- 050_pengajuan_izin.sql
-- Fitur self-service Pengajuan Izin (izin biasa).
-- Terpisah dari check-in/out. Izin sakit menyusul nanti.
-- ============================================================

create table if not exists public.pengajuan_izin (
  id                  uuid primary key default gen_random_uuid(),
  karyawan_id         uuid references public.karyawan(id) on delete cascade,
  tanggal_izin        date not null,
  jenis               text not null default 'izin_biasa',   -- 'izin_biasa' | (nanti) 'izin_sakit'
  foto_bukti_url      text,
  status              text not null default 'aktif',         -- 'aktif' | 'dibatalkan'
  dibatalkan_oleh     text,
  dibatalkan_at       timestamptz,
  catatan_pembatalan  text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_pengajuan_izin_karyawan_tgl
  on public.pengajuan_izin (karyawan_id, tanggal_izin);
create index if not exists idx_pengajuan_izin_status
  on public.pengajuan_izin (status, tanggal_izin);

alter table public.pengajuan_izin enable row level security;

drop policy if exists "pengajuan_izin_all" on public.pengajuan_izin;
create policy "pengajuan_izin_all" on public.pengajuan_izin
  for all to authenticated, anon using (true) with check (true);

-- Foto bukti pakai bucket "foto-absensi" (sudah public read + insert anon di migration 045),
-- disimpan di folder izin/. Tidak perlu bucket baru.

-- Verifikasi
select 'pengajuan_izin created' as info;
