-- ============================================================
-- ERP Roti Maryam - Schema Database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABEL USERS (PIN-based auth)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama TEXT NOT NULL,
  pin_hash TEXT NOT NULL, -- SHA-256 hash of 6-digit PIN
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'spv_pagi', 'spv_siang', 'staff')),
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL BAHAN BAKU
-- ============================================================
CREATE TABLE bahan_baku (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL, -- kg, gram, liter, pcs, sachet, dll
  brand TEXT CHECK (brand IN ('cane', 'mehana', 'both')) DEFAULT 'both',
  stok_saat_ini NUMERIC(10,3) DEFAULT 0,
  stok_minimum NUMERIC(10,3) DEFAULT 0, -- threshold untuk alert merah
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL PENERIMAAN BAHAN BAKU (Gudang Masuk)
-- ============================================================
CREATE TABLE penerimaan_bahan_baku (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bahan_baku_id UUID NOT NULL REFERENCES bahan_baku(id),
  jumlah NUMERIC(10,3) NOT NULL,
  satuan TEXT NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  keterangan TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL SKU PRODUK
-- ============================================================
CREATE TABLE produk_sku (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand TEXT NOT NULL CHECK (brand IN ('cane', 'mehana')),
  nama_brand TEXT NOT NULL, -- "Cane RawtheR" atau "Mehana Boga Utama"
  varian TEXT NOT NULL, -- Original, Melted Choco, dll
  isi_per_pack INTEGER NOT NULL DEFAULT 5,
  kode_sku TEXT UNIQUE NOT NULL,
  stok_saat_ini INTEGER DEFAULT 0,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL MASTER RESEP
-- ============================================================
CREATE TABLE master_resep (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produk_sku_id UUID NOT NULL REFERENCES produk_sku(id),
  bahan_baku_id UUID NOT NULL REFERENCES bahan_baku(id),
  jumlah_per_pack NUMERIC(10,5) NOT NULL, -- jumlah bahan per 1 pack produk
  satuan TEXT NOT NULL,
  keterangan TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produk_sku_id, bahan_baku_id)
);

-- ============================================================
-- TABEL BATCH PRODUKSI
-- ============================================================
CREATE TABLE batch_produksi (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produk_sku_id UUID NOT NULL REFERENCES produk_sku(id),
  tanggal_produksi DATE NOT NULL DEFAULT CURRENT_DATE,
  shift TEXT NOT NULL CHECK (shift IN ('pagi', 'siang')),
  jumlah_pack_rencana INTEGER NOT NULL,
  jumlah_pack_adonan INTEGER, -- actual setelah adonan
  jumlah_pack_packing INTEGER, -- setelah packing (bisa kurang karena reject)
  jumlah_pack_freezer INTEGER, -- final masuk freezer
  jumlah_reject INTEGER DEFAULT 0,
  catatan_reject TEXT,
  status TEXT NOT NULL DEFAULT 'adonan' CHECK (status IN ('adonan', 'packing', 'freezer', 'selesai')),
  keterangan TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL PENGGUNAAN BAHAN (otomatis dari produksi)
-- ============================================================
CREATE TABLE penggunaan_bahan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_produksi_id UUID NOT NULL REFERENCES batch_produksi(id),
  bahan_baku_id UUID NOT NULL REFERENCES bahan_baku(id),
  jumlah_digunakan NUMERIC(10,3) NOT NULL,
  satuan TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABEL PENGIRIMAN (Barang Keluar)
-- ============================================================
CREATE TABLE pengiriman (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  produk_sku_id UUID NOT NULL REFERENCES produk_sku(id),
  jumlah_pack INTEGER NOT NULL,
  tanggal_keluar DATE NOT NULL DEFAULT CURRENT_DATE,
  keterangan TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FUNCTION: Update timestamp otomatis
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bahan_baku_updated_at BEFORE UPDATE ON bahan_baku FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_penerimaan_updated_at BEFORE UPDATE ON penerimaan_bahan_baku FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_produk_sku_updated_at BEFORE UPDATE ON produk_sku FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_master_resep_updated_at BEFORE UPDATE ON master_resep FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_batch_produksi_updated_at BEFORE UPDATE ON batch_produksi FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pengiriman_updated_at BEFORE UPDATE ON pengiriman FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: Update stok bahan baku setelah penerimaan
-- ============================================================
CREATE OR REPLACE FUNCTION update_stok_bahan_masuk()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bahan_baku
  SET stok_saat_ini = stok_saat_ini + NEW.jumlah,
      updated_at = NOW()
  WHERE id = NEW.bahan_baku_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stok_masuk
AFTER INSERT ON penerimaan_bahan_baku
FOR EACH ROW EXECUTE FUNCTION update_stok_bahan_masuk();

-- ============================================================
-- FUNCTION: Update stok produk jadi saat batch selesai ke freezer
-- ============================================================
CREATE OR REPLACE FUNCTION update_stok_produk_freezer()
RETURNS TRIGGER AS $$
BEGIN
  -- Jika status baru = 'freezer' dan status lama bukan 'freezer'
  IF NEW.status = 'freezer' AND OLD.status != 'freezer' THEN
    UPDATE produk_sku
    SET stok_saat_ini = stok_saat_ini + COALESCE(NEW.jumlah_pack_freezer, 0),
        updated_at = NOW()
    WHERE id = NEW.produk_sku_id;
  END IF;
  -- Jika status berubah dari freezer (rollback)
  IF OLD.status = 'freezer' AND NEW.status != 'freezer' THEN
    UPDATE produk_sku
    SET stok_saat_ini = stok_saat_ini - COALESCE(OLD.jumlah_pack_freezer, 0),
        updated_at = NOW()
    WHERE id = OLD.produk_sku_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stok_produk_freezer
AFTER UPDATE ON batch_produksi
FOR EACH ROW EXECUTE FUNCTION update_stok_produk_freezer();

-- ============================================================
-- FUNCTION: Update stok produk jadi saat pengiriman
-- ============================================================
CREATE OR REPLACE FUNCTION update_stok_produk_keluar()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE produk_sku
  SET stok_saat_ini = stok_saat_ini - NEW.jumlah_pack,
      updated_at = NOW()
  WHERE id = NEW.produk_sku_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stok_keluar
AFTER INSERT ON pengiriman
FOR EACH ROW EXECUTE FUNCTION update_stok_produk_keluar();

-- ============================================================
-- ROW LEVEL SECURITY (disable untuk aplikasi dengan PIN auth)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bahan_baku ENABLE ROW LEVEL SECURITY;
ALTER TABLE penerimaan_bahan_baku ENABLE ROW LEVEL SECURITY;
ALTER TABLE produk_sku ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_resep ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_produksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE penggunaan_bahan ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengiriman ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all access via anon key (auth dikelola di aplikasi)
CREATE POLICY "allow_all" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON bahan_baku FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON penerimaan_bahan_baku FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON produk_sku FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON master_resep FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON batch_produksi FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON penggunaan_bahan FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON pengiriman FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- DATA AWAL: Bahan Baku
-- ============================================================
INSERT INTO bahan_baku (nama, satuan, brand, stok_minimum) VALUES
  -- Cane RawtheR
  ('Terigu', 'kg', 'both', 10),
  ('Margarine Blue Band', 'kg', 'cane', 5),
  ('Garam', 'kg', 'both', 1),
  ('Gula', 'kg', 'both', 5),
  ('Air', 'liter', 'both', 10),
  ('Minyak Resep', 'liter', 'both', 5),
  ('Minyak Rendam', 'liter', 'both', 5),
  ('Telur', 'kg', 'cane', 5),
  ('Baking Powder', 'kg', 'cane', 1),
  ('Tepung Gandum Utuh', 'kg', 'cane', 3),
  -- Mehana Boga Utama
  ('Margarine Menara', 'kg', 'mehana', 5);

-- ============================================================
-- DATA AWAL: SKU Produk
-- ============================================================
INSERT INTO produk_sku (brand, nama_brand, varian, isi_per_pack, kode_sku) VALUES
  -- Cane RawtheR
  ('cane', 'Cane RawtheR', 'Original', 5, 'CANE-ORG-5'),
  ('cane', 'Cane RawtheR', 'Melted Choco', 5, 'CANE-CHO-5'),
  ('cane', 'Cane RawtheR', 'Grated Cheese', 5, 'CANE-CHE-5'),
  ('cane', 'Cane RawtheR', 'Whole Wheat', 5, 'CANE-WW-5'),
  -- Mehana Boga Utama
  ('mehana', 'Mehana Boga Utama', 'Original', 5, 'MBU-ORG-5'),
  ('mehana', 'Mehana Boga Utama', 'Original', 10, 'MBU-ORG-10'),
  ('mehana', 'Mehana Boga Utama', 'Cokelat', 5, 'MBU-COK-5'),
  ('mehana', 'Mehana Boga Utama', 'Cokelat', 10, 'MBU-COK-10'),
  ('mehana', 'Mehana Boga Utama', 'Keju', 5, 'MBU-KEJ-5'),
  ('mehana', 'Mehana Boga Utama', 'Keju', 10, 'MBU-KEJ-10');

-- ============================================================
-- DATA AWAL: User Owner
-- PIN default: 111111
-- Hash digenerate langsung oleh pgcrypto agar pasti cocok
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (nama, pin_hash, role) VALUES
  ('Owner Admin', encode(digest('111111', 'sha256'), 'hex'), 'owner');
