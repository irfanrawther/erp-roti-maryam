-- ============================================================
-- 047_dummy_absensi_seed.sql  —  Data dummy untuk testing absensi
-- 3 karyawan tester + assign shift HARI INI (WIB).
-- PIN di-hash SHA-256 (sesuai sistem):
--   100001 -> Test Pagi  (Shift 1, 06:00-16:00)
--   100002 -> Test Siang (Shift 4, 13:00-23:00)
--   100003 -> Test Alpha (Shift 1, sengaja tidak check-in)
-- Idempoten: aman dijalankan ulang.
-- ============================================================

-- 1) Karyawan dummy (insert hanya jika PIN belum ada)
INSERT INTO karyawan (nama, jabatan, pin_absensi, status)
SELECT v.nama, 'Tester', v.pin, 'aktif'
FROM (VALUES
  ('Test Pagi',  '97c489b6c1231ecd9fac99df40e60cec000a70a057d5971fb520c578da8e8841'),
  ('Test Siang', '3fb836229505c02d85ef0286b0c93213db710766d841f00d91db5edaeade136b'),
  ('Test Alpha', '24eb33c5f8f98314500b1c7f3fe403413c3b3fe0e4ae8ac5cc464dd2b686802c')
) AS v(nama, pin)
WHERE NOT EXISTS (SELECT 1 FROM karyawan k WHERE k.pin_absensi = v.pin);

-- 2) Assign shift HARI INI (tanggal WIB)
INSERT INTO shift_assignment (karyawan_id, tanggal, shift_id, is_libur, created_by)
SELECT k.id, (now() AT TIME ZONE 'Asia/Jakarta')::date, s.id, false, 'Dummy Seed'
FROM (VALUES
  ('97c489b6c1231ecd9fac99df40e60cec000a70a057d5971fb520c578da8e8841', 'Shift 1'),
  ('3fb836229505c02d85ef0286b0c93213db710766d841f00d91db5edaeade136b', 'Shift 4'),
  ('24eb33c5f8f98314500b1c7f3fe403413c3b3fe0e4ae8ac5cc464dd2b686802c', 'Shift 1')
) AS m(pin, shift_name)
JOIN karyawan     k ON k.pin_absensi = m.pin
JOIN shift_master s ON s.nama_shift  = m.shift_name
ON CONFLICT (karyawan_id, tanggal)
DO UPDATE SET shift_id = EXCLUDED.shift_id, is_libur = false;

-- 3) KONFIRMASI — karyawan dummy
SELECT nama, jabatan, status, '••••••' AS pin FROM karyawan
WHERE nama IN ('Test Pagi','Test Siang','Test Alpha') ORDER BY nama;

-- 4) KONFIRMASI — shift assignment hari ini
SELECT k.nama, sa.tanggal, sm.nama_shift, sm.jam_masuk, sm.jam_pulang
FROM shift_assignment sa
JOIN karyawan k      ON k.id = sa.karyawan_id
JOIN shift_master sm ON sm.id = sa.shift_id
WHERE k.nama IN ('Test Pagi','Test Siang','Test Alpha')
  AND sa.tanggal = (now() AT TIME ZONE 'Asia/Jakarta')::date
ORDER BY k.nama;
