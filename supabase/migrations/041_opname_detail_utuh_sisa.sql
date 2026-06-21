-- Migration 041: Tambah kolom stok_utuh/satuan_utuh/stok_sisa/satuan_sisa
-- ke stock_opname_detail_bahan untuk pisah input utuh & sisa

ALTER TABLE stock_opname_detail_bahan
  ADD COLUMN IF NOT EXISTS stok_utuh   numeric,
  ADD COLUMN IF NOT EXISTS satuan_utuh text,
  ADD COLUMN IF NOT EXISTS stok_sisa   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS satuan_sisa text;

SELECT 'stock_opname_detail_bahan updated' AS info;
