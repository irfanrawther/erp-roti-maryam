-- Migration 040: Add 'pic' to users_role_check constraint
-- Run this in Supabase SQL Editor

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'spv', 'staff_produksi', 'staff_packing_pengiriman', 'pic'));
