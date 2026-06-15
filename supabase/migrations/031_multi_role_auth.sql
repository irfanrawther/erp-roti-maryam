-- ============================================================
-- 031_multi_role_auth.sql
-- Sistem multi-role dengan PIN per user + access_scope untuk SPV.
--
-- Roles baru:
--   super_admin               → akses penuh
--   spv                       → supervisor (scope: adonan_rendam | packing)
--   staff_produksi            → hanya Bahan Baku
--   staff_packing_pengiriman  → hanya Pengiriman
--
-- Aman dijalankan berulang (idempotent).
-- Jalankan di Supabase SQL Editor, lalu: NOTIFY pgrst, 'reload schema';
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tambah kolom access_scope (untuk membedakan SPV: adonan_rendam vs packing)
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_scope TEXT;

-- 2. DROP constraint role lama DULU — supaya UPDATE ke role baru tidak ditolak.
--    (Constraint lama hanya mengizinkan owner/manager/spv_pagi/spv_siang/staff,
--     jadi set role='super_admin' akan gagal kalau constraint belum di-drop.)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 3. Migrasi role lama → role baru (sekarang aman, tanpa constraint)
UPDATE users SET role = 'super_admin'    WHERE role IN ('owner', 'manager');
UPDATE users SET role = 'spv'            WHERE role IN ('spv_pagi', 'spv_siang');
UPDATE users SET role = 'staff_produksi' WHERE role = 'staff';

-- 4. Pasang CHECK constraint baru (semua row sudah role baru → valid)
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'spv', 'staff_produksi', 'staff_packing_pengiriman'));

-- 5. Pastikan user admin lama jadi super_admin (tanpa scope)
UPDATE users SET role = 'super_admin', access_scope = NULL
  WHERE nama IN ('Owner Admin', 'Super Admin');

-- 6. Seed user awal (starter PIN — bisa diubah Super Admin via Kelola User)
--    PIN di-hash SHA-256 (sama dengan /api/auth/login)
INSERT INTO users (nama, pin_hash, role, access_scope, aktif)
SELECT 'Nofita', encode(digest('222222', 'sha256'), 'hex'), 'spv', 'adonan_rendam', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE nama = 'Nofita');

INSERT INTO users (nama, pin_hash, role, access_scope, aktif)
SELECT 'Adam', encode(digest('333333', 'sha256'), 'hex'), 'spv', 'packing', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE nama = 'Adam');

INSERT INTO users (nama, pin_hash, role, access_scope, aktif)
SELECT 'Staff Produksi', encode(digest('444444', 'sha256'), 'hex'), 'staff_produksi', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE nama = 'Staff Produksi');

INSERT INTO users (nama, pin_hash, role, access_scope, aktif)
SELECT 'Staff Packing Pengiriman', encode(digest('555555', 'sha256'), 'hex'), 'staff_packing_pengiriman', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE nama = 'Staff Packing Pengiriman');

-- 7. Pastikan scope SPV benar (kalau user sudah ada sebelumnya)
UPDATE users SET access_scope = 'adonan_rendam' WHERE nama = 'Nofita' AND role = 'spv';
UPDATE users SET access_scope = 'packing'       WHERE nama = 'Adam'   AND role = 'spv';

-- 8. PIN harus unik antar semua user.
--    Catatan: keunikan PIN sekarang divalidasi di level aplikasi (halaman
--    Kelola User menolak PIN yang sudah dipakai). Unique index DB di-skip
--    karena bisa gagal kalau ada data lama dengan PIN duplikat (mis. dua
--    akun admin sama-sama PIN 111111) — dan akun lama tidak bisa dihapus
--    begitu saja karena dipakai sebagai created_by di tabel lain.
--    Aktifkan baris di bawah HANYA setelah memastikan tidak ada PIN duplikat:
-- CREATE UNIQUE INDEX IF NOT EXISTS users_pin_hash_unique ON users (pin_hash);

-- 9. Laporan: cek apakah ada PIN (pin_hash) yang dipakai >1 user
SELECT pin_hash, COUNT(*) AS jumlah_user, string_agg(nama, ', ') AS user_list
FROM users
GROUP BY pin_hash
HAVING COUNT(*) > 1;

-- 10. Verifikasi daftar user
SELECT nama, role, access_scope, aktif FROM users ORDER BY role, nama;
