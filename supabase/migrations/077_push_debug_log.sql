-- ============================================================
-- 077_push_debug_log.sql
-- Log sementara buat debug kenapa subscribeToPush() gagal di device
-- tertentu (HP user) tanpa perlu buka DevTools mereka. Boleh dihapus
-- tabelnya setelah push notification chat terbukti jalan normal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_debug_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text,
  step        text        NOT NULL,
  detail      text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_debug_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_debug_log_all" ON public.push_debug_log;
CREATE POLICY "push_debug_log_all" ON public.push_debug_log
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

SELECT 'push_debug_log created' AS info;
