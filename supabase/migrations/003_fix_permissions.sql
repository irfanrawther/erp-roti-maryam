-- ============================================================
-- FIX: Grant permission ke anon role untuk semua tabel
-- Jalankan seluruh file ini di Supabase SQL Editor
-- ============================================================

-- GRANT usage pada schema public
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- GRANT semua operasi pada setiap tabel ke anon
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users               TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bahan_baku          TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.penerimaan_bahan_baku TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produk_sku          TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_resep        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.batch_produksi      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.penggunaan_bahan    TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pengiriman          TO anon;

-- GRANT permission untuk sequences (auto-generate UUID via uuid_generate_v4)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Pastikan tabel future juga otomatis dapat grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;

-- ============================================================
-- Reset & buat ulang semua RLS policy dengan benar
-- ============================================================

-- users
DROP POLICY IF EXISTS "allow_all" ON public.users;
CREATE POLICY "anon_all" ON public.users
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- bahan_baku
DROP POLICY IF EXISTS "allow_all" ON public.bahan_baku;
CREATE POLICY "anon_all" ON public.bahan_baku
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- penerimaan_bahan_baku
DROP POLICY IF EXISTS "allow_all" ON public.penerimaan_bahan_baku;
CREATE POLICY "anon_all" ON public.penerimaan_bahan_baku
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- produk_sku
DROP POLICY IF EXISTS "allow_all" ON public.produk_sku;
CREATE POLICY "anon_all" ON public.produk_sku
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- master_resep
DROP POLICY IF EXISTS "allow_all" ON public.master_resep;
CREATE POLICY "anon_all" ON public.master_resep
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- batch_produksi
DROP POLICY IF EXISTS "allow_all" ON public.batch_produksi;
CREATE POLICY "anon_all" ON public.batch_produksi
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- penggunaan_bahan
DROP POLICY IF EXISTS "allow_all" ON public.penggunaan_bahan;
CREATE POLICY "anon_all" ON public.penggunaan_bahan
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- pengiriman
DROP POLICY IF EXISTS "allow_all" ON public.pengiriman;
CREATE POLICY "anon_all" ON public.pengiriman
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Reset pin_hash owner sekalian (pakai pgcrypto, pasti benar)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.users
SET pin_hash = encode(digest('111111', 'sha256'), 'hex'),
    aktif    = true
WHERE role = 'owner';

-- ============================================================
-- Verifikasi akhir
-- ============================================================
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
GROUP BY grantee, table_name
ORDER BY table_name;
