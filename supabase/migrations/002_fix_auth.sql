-- ============================================================
-- FIX AUTH: Jalankan di Supabase SQL Editor
-- ============================================================

-- LANGKAH 1: Cek isi tabel users saat ini
SELECT id, nama, role, aktif, LEFT(pin_hash, 20) || '...' AS pin_hash_preview
FROM users;

-- LANGKAH 2: Pastikan RLS policy untuk tabel users ada dan benar
-- (Jalankan ini jika login masih tidak bisa)
DROP POLICY IF EXISTS "allow_all" ON users;
CREATE POLICY "allow_all" ON users
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- LANGKAH 3: Update pin_hash untuk user owner
-- Hash SHA-256 dari "111111" yang BENAR adalah:
-- bcb15f821479b4d5772bd0ca866c00ad5f926e3580720659cc80d39c9d09802a
--
-- TAPI kita tidak hardcode — gunakan fungsi pgcrypto untuk memastikan benar:

-- Aktifkan extension pgcrypto (kalau belum ada)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reset pin_hash owner dengan hash yang pasti benar (dari pgcrypto)
UPDATE users
SET pin_hash = encode(digest('111111', 'sha256'), 'hex'),
    aktif    = true
WHERE role = 'owner';

-- Verifikasi hasilnya:
SELECT id, nama, role, aktif, pin_hash
FROM users
WHERE role = 'owner';

-- LANGKAH 4: Kalau nama kolom berbeda (misal is_active bukan aktif)
-- cek dulu struktur tabel:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
