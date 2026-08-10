-- ============================================================
-- 058_fix_adjustment_rls_anon.sql
-- Bug: policy adjustment_bahan_baku (migration 033) cuma allow
-- role 'authenticated', padahal app ini pakai anon key (tanpa
-- Supabase Auth session) — jadi SEMUA insert/select ke tabel ini
-- selalu diblok RLS secara diam-diam (gagal tanpa error terlihat).
-- Akibatnya histori Sisa/Over PIC tidak pernah tersimpan/tampil.
-- ============================================================

DROP POLICY IF EXISTS adj_auth_all ON adjustment_bahan_baku;

CREATE POLICY adj_auth_all ON adjustment_bahan_baku
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

SELECT 'adjustment_bahan_baku RLS now allows anon' AS info;
