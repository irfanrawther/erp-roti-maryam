"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal } from "@/lib/utils";
import { Package, ChefHat, Truck, Snowflake, X, AlertTriangle } from "lucide-react";

interface StokBahan {
  id: string;
  nama: string;
  satuan: string;
  stok_saat_ini: number;
  stok_minimum: number;
}

interface StokProduk {
  id: string;
  brand: string;
  nama_brand: string;
  varian: string;
  isi_per_pack: number;
  kode_sku: string;
  stok_saat_ini: number;
}

interface BatchBerjalan {
  id: string;
  tanggal_produksi: string;
  shift: string;
  status: string;
  jumlah_pack_rencana: number;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number };
  users: { nama: string };
}

interface PengirimanHariIni {
  id: string;
  jumlah_pack: number;
  produk_sku: { nama_brand: string; varian: string };
}

export default function DashboardPage() {
  const user = getUserSession();
  const today = new Date().toISOString().split("T")[0];

  const [bahanKritis, setBahanKritis] = useState<StokBahan[]>([]);
  const [allBahan, setAllBahan] = useState<StokBahan[]>([]);
  const [stokProduk, setStokProduk] = useState<StokProduk[]>([]);
  const [batchBerjalan, setBatchBerjalan] = useState<BatchBerjalan[]>([]);
  const [pengirimanHariIni, setPengirimanHariIni] = useState<PengirimanHariIni[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModalBahan, setShowModalBahan] = useState(false);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public" }, fetchAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [bahanRes, produkRes, batchRes, pengirimanRes] = await Promise.all([
      supabase.from("bahan_baku").select("id, nama, satuan, stok_saat_ini, stok_minimum").eq("aktif", true).order("nama"),
      supabase.from("produk_sku").select("id, brand, nama_brand, varian, isi_per_pack, kode_sku, stok_saat_ini").eq("aktif", true),
      supabase.from("batch_produksi").select("id, tanggal_produksi, shift, status, jumlah_pack_rencana, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack), users:created_by(nama)").neq("status", "selesai").order("created_at", { ascending: false }),
      supabase.from("pengiriman").select("id, jumlah_pack, produk_sku:produk_sku_id(nama_brand, varian)").eq("tanggal_keluar", today),
    ]);

    if (bahanRes.data) {
      setAllBahan(bahanRes.data);
      setBahanKritis(bahanRes.data.filter((b) => b.stok_saat_ini <= b.stok_minimum));
    }
    if (produkRes.data) {
      const URUTAN: Record<string, number> = {
        "Original": 1, "Melted Choco": 2, "Grated Cheese": 3, "Whole Wheat": 4,
        "Cokelat": 2, "Keju": 3,
      };
      const BRAND_URUTAN: Record<string, number> = { "cane": 1, "mehana": 2 };
      const sorted = [...produkRes.data].sort((a, b) => {
        const brandDiff = (BRAND_URUTAN[a.brand as string] ?? 9) - (BRAND_URUTAN[b.brand as string] ?? 9);
        if (brandDiff !== 0) return brandDiff;
        return (URUTAN[a.varian] ?? 9) - (URUTAN[b.varian] ?? 9);
      });
      setStokProduk(sorted);
    }
    if (batchRes.data) setBatchBerjalan(batchRes.data as unknown as BatchBerjalan[]);
    if (pengirimanRes.data) setPengirimanHariIni(pengirimanRes.data as unknown as PengirimanHariIni[]);
    setLoading(false);
  }

  const totalPengirimanHariIni = pengirimanHariIni.reduce((s, p) => s + p.jumlah_pack, 0);
  const statusLabels: Record<string, string> = { adonan: "Adonan", packing: "Packing", freezer: "Freezer", selesai: "Selesai" };
  const statusClass: Record<string, string> = { adonan: "badge-status-adonan", packing: "badge-status-packing", freezer: "badge-status-freezer", selesai: "badge-status-selesai" };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Selamat datang, {user?.nama} 👋</h1>
        <p className="text-gray-500 text-sm">{formatTanggal(new Date())}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card Bahan Baku — clickable */}
        <button
          onClick={() => setShowModalBahan(true)}
          className="card text-left hover:shadow-md hover:border-amber-200 transition-all active:scale-95 border border-transparent"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bahanKritis.length > 0 ? "bg-red-100" : "bg-amber-100"}`}>
              <Package size={16} className={bahanKritis.length > 0 ? "text-red-500" : "text-amber-600"} />
            </div>
            <p className="text-xs text-gray-500">Bahan Baku</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{allBahan.length}</p>
          {bahanKritis.length > 0 ? (
            <p className="text-xs font-semibold text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={11} />
              {bahanKritis.length} kritis
            </p>
          ) : (
            <p className="text-xs text-gray-400">semua aman</p>
          )}
        </button>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <ChefHat size={16} className="text-blue-600" />
            </div>
            <p className="text-xs text-gray-500">Batch Aktif</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{batchBerjalan.length}</p>
          <p className="text-xs text-gray-400">sedang berjalan</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Snowflake size={16} className="text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500">Total SKU</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stokProduk.length}</p>
          <p className="text-xs text-gray-400">produk aktif</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Truck size={16} className="text-green-600" />
            </div>
            <p className="text-xs text-gray-500">Kiriman Hari Ini</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatAngka(totalPengirimanHariIni)}</p>
          <p className="text-xs text-gray-400">pack dikirim</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Batch Produksi Berjalan */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ChefHat size={16} className="text-amber-500" />
            Batch Adonan
          </h2>
          {batchBerjalan.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Tidak ada batch aktif</p>
          ) : (
            <div className="space-y-2">
              {batchBerjalan.map((b) => {
                const sku      = b.produk_sku as { nama_brand: string; varian: string };
                const namaUser = (b.users as { nama: string })?.nama ?? "—";
                return (
                  <div key={b.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-medium text-sm text-gray-800 leading-snug">
                        {sku?.nama_brand} - {sku?.varian}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span className="font-semibold text-amber-600">{formatAngka(b.jumlah_pack_rencana)} kg</span>
                        <span className="text-gray-400"> — {namaUser}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTanggal(b.tanggal_produksi)}</p>
                    </div>
                    <span className={statusClass[b.status]}>{statusLabels[b.status]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stok Produk Jadi */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Snowflake size={16} className="text-indigo-500" />
            Stok Produk Jadi
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stokProduk.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.varian}</p>
                  <p className="text-xs text-gray-400">{p.nama_brand} • {p.isi_per_pack} pcs/pack</p>
                </div>
                <span className={`text-sm font-bold ${p.stok_saat_ini === 0 ? "text-red-500" : "text-gray-800"}`}>
                  {formatAngka(p.stok_saat_ini)} pack
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Stok Bahan Baku */}
      {showModalBahan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-amber-500" />
                <h2 className="font-bold text-gray-800">Stok Bahan Baku</h2>
                {bahanKritis.length > 0 && (
                  <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {bahanKritis.length} kritis
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowModalBahan(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* List bahan — kritis di atas */}
            <div className="overflow-y-auto p-4 space-y-2">
              {/* Kritis dulu */}
              {bahanKritis.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider px-1">⚠ Stok Kritis</p>
                  {allBahan
                    .filter((b) => b.stok_saat_ini <= b.stok_minimum)
                    .map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200">
                        <div>
                          <p className="text-sm font-semibold text-red-700">{b.nama}</p>
                          <p className="text-xs text-red-400">Min: {formatAngka(b.stok_minimum)} {b.satuan}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-red-600">{formatAngka(b.stok_saat_ini)}</p>
                          <p className="text-xs text-red-400">{b.satuan}</p>
                        </div>
                      </div>
                    ))}
                  <div className="border-t border-gray-100 my-2" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">✓ Stok Normal</p>
                </>
              )}

              {/* Normal */}
              {allBahan
                .filter((b) => b.stok_saat_ini > b.stok_minimum)
                .map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.nama}</p>
                      <p className="text-xs text-gray-400">Min: {formatAngka(b.stok_minimum)} {b.satuan}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-700">{formatAngka(b.stok_saat_ini)}</p>
                      <p className="text-xs text-gray-400">{b.satuan}</p>
                    </div>
                  </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setShowModalBahan(false)}
                className="btn-secondary w-full"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
