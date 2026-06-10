-- Fix satuan dan stok minimum Telur
UPDATE bahan_baku
SET satuan       = 'Pcs',
    stok_minimum = 100,
    updated_at   = NOW()
WHERE nama = 'Telur';

-- Verifikasi
SELECT nama, satuan, stok_minimum FROM bahan_baku WHERE nama = 'Telur';
