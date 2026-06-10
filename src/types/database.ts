export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          nama: string;
          pin_hash: string;
          role: "owner" | "manager" | "spv_pagi" | "spv_siang" | "staff";
          aktif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      bahan_baku: {
        Row: {
          id: string;
          nama: string;
          satuan: string;
          brand: "cane" | "mehana" | "both";
          stok_saat_ini: number;
          stok_minimum: number;
          aktif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["bahan_baku"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["bahan_baku"]["Insert"]>;
      };
      penerimaan_bahan_baku: {
        Row: {
          id: string;
          bahan_baku_id: string;
          jumlah: number;
          satuan: string;
          tanggal: string;
          keterangan: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["penerimaan_bahan_baku"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["penerimaan_bahan_baku"]["Insert"]>;
      };
      produk_sku: {
        Row: {
          id: string;
          brand: "cane" | "mehana";
          nama_brand: string;
          varian: string;
          isi_per_pack: number;
          kode_sku: string;
          stok_saat_ini: number;
          aktif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["produk_sku"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["produk_sku"]["Insert"]>;
      };
      master_resep: {
        Row: {
          id: string;
          produk_sku_id: string;
          bahan_baku_id: string;
          jumlah_per_pack: number;
          satuan: string;
          keterangan: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["master_resep"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["master_resep"]["Insert"]>;
      };
      batch_produksi: {
        Row: {
          id: string;
          produk_sku_id: string;
          tanggal_produksi: string;
          shift: "pagi" | "siang";
          jumlah_pack_rencana: number;
          jumlah_pack_adonan: number | null;
          jumlah_pack_packing: number | null;
          jumlah_pack_freezer: number | null;
          jumlah_reject: number;
          catatan_reject: string | null;
          status: "adonan" | "packing" | "freezer" | "selesai";
          keterangan: string | null;
          created_by: string;
          updated_by: string | null;
          status_updated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["batch_produksi"]["Row"], "id" | "created_at" | "updated_at" | "status_updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["batch_produksi"]["Insert"]>;
      };
      penggunaan_bahan: {
        Row: {
          id: string;
          batch_produksi_id: string;
          bahan_baku_id: string;
          jumlah_digunakan: number;
          satuan: string;
          created_by: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["penggunaan_bahan"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["penggunaan_bahan"]["Insert"]>;
      };
      pengiriman: {
        Row: {
          id: string;
          produk_sku_id: string;
          jumlah_pack: number;
          tanggal_keluar: string;
          keterangan: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["pengiriman"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["pengiriman"]["Insert"]>;
      };
    };
  };
};
