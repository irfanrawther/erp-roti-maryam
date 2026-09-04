-- Catat waktu SUBMIT langkah Rendam secara terpisah dari created_at
-- (waktu Adonan dibuat) — supaya histori produksi bisa tampilkan jam
-- Adonan dan jam Rendam masing-masing, bukan digabung jadi satu label
-- yang cuma menunjukkan jam Adonan.
ALTER TABLE batch_produksi
  ADD COLUMN IF NOT EXISTS rendam_at timestamptz;
