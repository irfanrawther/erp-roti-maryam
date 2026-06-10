"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal, formatTanggalWaktu } from "@/lib/utils";
import { Plus, X, Truck, Filter } from "lucide-react";

interface ProdukSku {
  id: string;
  brand: string;
  nama_brand: string;
  varian: string;
  isi_per_pack: number;
  kode_sku: string;
  stok_saat_ini: number;
}

interface Pengiriman {
  id: string;
  jumlah_pack: number;
  tanggal_keluar: string;
  keterangan: string | null;
  created_at: string;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number; kode_sku: string };
  users: { nama: string };
}

export default function PengirimanPage() {
  const user = getUserSession();
  const [skuList, setSkuList] = useState<ProdukSku[]>([]);
  const [pengirimanList, setPengirimanList] = useState<Pengiriman[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterSku, setFilterSku] = useState("");
  const [filterTanggal, setFilterTanggal] = useState("");

  const [form, setForm] = useState({
    produk_sku_id: "",
    jumlah_pack: "",
    tanggal_keluar: new Date().toISOString().split("T")[0],
    keterangan: "",
  });

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("pengiriman-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pengiriman" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "produk_sku" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    const [skuRes, pengirimanRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, nama_brand, varian, isi_per_pack, kode_sku, stok_saat_ini").eq("aktif", true).order("brand").order("varian"),
      supabase.from("pengiriman").select("id, jumlah_pack, tanggal_keluar, keterangan, created_at, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack, kode_sku), users:created_by(nama)").order("created_at", { ascending: false }).limit(100),
    ]);
    if (skuRes.data) setSkuList(skuRes.data);
    if (pengirimanRes.data) setPengirimanList(pengirimanRes.data as unknown as Pengiriman[]);
  }

  const selectedSku = skuList.find((s) => s.id === form.produk_sku_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.produk_sku_id || !form.jumlah_pack) return;
    const jumlah = parseInt(form.jumlah_pack);
    if (selectedSku && jumlah > selectedSku.stok_saat_ini) {
      alert(`Stok tidak cukup! Stok tersedia: ${formatAngka(selectedSku.stok_saat_ini)} pack`);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("pengiriman").insert({
      produk_sku_id: form.produk_sku_id,
      jumlah_pack: jumlah,
      tanggal_keluar: form.tanggal_keluar,
      keterangan: form.keterangan || null,
      created_by: user.id,
    });
    setLoading(false);
    if (!error) {
      setShowForm(false);
      setForm({ produk_sku_id: "", jumlah_pack: "", tanggal_keluar: new Date().toISOString().split("T")[0], keterangan: "" });
      fetchData();
    }
  }

  const pengirimanFiltered = pengirimanList.filter((p) => {
    const matchSku = !filterSku || (p.produk_sku as { nama_brand: string; varian: string })?.varian?.toLowerCase().includes(filterSku.toLowerCase()) ||
      (p.produk_sku as { nama_brand: string })?.nama_brand?.toLowerCase().includes(filterSku.toLowerCase());
    const matchTanggal = !filterTanggal || p.tanggal_keluar === filterTanggal;
    return matchSku && matchTanggal;
  });

  const totalPack = pengirimanFiltered.reduce((s, p) => s + p.jumlah_pack, 0);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Pengiriman</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Catat Pengiriman
        </button>
      </div>

      {/* Stok Cepat */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">Stok Produk Jadi</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {skuList.map((s) => (
            <div key={s.id} className={`p-3 rounded-xl border text-center ${s.stok_saat_ini === 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"}`}>
              <p className="text-xs text-gray-500 truncate">{s.nama_brand}</p>
              <p className="text-xs font-medium text-gray-700 truncate">{s.varian} ({s.isi_per_pack}pcs)</p>
              <p className={`text-lg font-bold mt-1 ${s.stok_saat_ini === 0 ? "text-red-500" : "text-gray-800"}`}>
                {formatAngka(s.stok_saat_ini)}
              </p>
              <p className="text-xs text-gray-400">pack</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Filter Riwayat</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Produk</label>
            <input className="input" placeholder="Varian / brand..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
          </div>
          <div>
            <label className="label">Tanggal</label>
            <input type="date" className="input" value={filterTanggal} onChange={(e) => setFilterTanggal(e.target.value)} />
          </div>
        </div>
      </div>

      {/* List Pengiriman */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-green-500" />
            <span className="font-medium text-gray-700">Riwayat Pengiriman ({pengirimanFiltered.length})</span>
          </div>
          <span className="text-sm font-bold text-gray-600">{formatAngka(totalPack)} pack total</span>
        </div>
        <div className="space-y-2">
          {pengirimanFiltered.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Belum ada data pengiriman</p>
          ) : (
            pengirimanFiltered.map((p) => (
              <div key={p.id} className="border-b border-gray-50 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-800">
                      {(p.produk_sku as { nama_brand: string; varian: string })?.nama_brand} — {(p.produk_sku as { nama_brand: string; varian: string })?.varian}
                    </p>
                    <p className="text-xs text-gray-500">{formatTanggal(p.tanggal_keluar)}</p>
                    <p className="text-xs text-gray-400">oleh {(p.users as { nama: string })?.nama} • {formatTanggalWaktu(p.created_at)}</p>
                    {p.keterangan && <p className="text-xs text-gray-400 italic">{p.keterangan}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-500 text-sm">-{formatAngka(p.jumlah_pack)}</p>
                    <p className="text-xs text-gray-400">pack</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">Catat Pengiriman</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="label">Produk / SKU *</label>
                <select className="input" required value={form.produk_sku_id} onChange={(e) => setForm({ ...form, produk_sku_id: e.target.value })}>
                  <option value="">Pilih produk...</option>
                  <optgroup label="Cane RawtheR">
                    {skuList.filter((s) => s.brand === "cane").map((s) => (
                      <option key={s.id} value={s.id}>{s.varian} ({s.isi_per_pack}pcs) — Stok: {s.stok_saat_ini}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Mehana Boga Utama">
                    {skuList.filter((s) => s.brand === "mehana").map((s) => (
                      <option key={s.id} value={s.id}>{s.varian} ({s.isi_per_pack}pcs) — Stok: {s.stok_saat_ini}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {selectedSku && (
                <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-700">
                  Stok tersedia: <strong>{formatAngka(selectedSku.stok_saat_ini)} pack</strong>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Jumlah Pack *</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedSku?.stok_saat_ini}
                    className="input"
                    required
                    value={form.jumlah_pack}
                    onChange={(e) => setForm({ ...form, jumlah_pack: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Tanggal *</label>
                  <input type="date" className="input" required value={form.tanggal_keluar} onChange={(e) => setForm({ ...form, tanggal_keluar: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Keterangan</label>
                <textarea className="input resize-none" rows={2} value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} placeholder="Tujuan pengiriman, customer, dll..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? "Menyimpan..." : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
