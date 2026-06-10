"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal } from "@/lib/utils";
import { ChefHat, ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface ProdukSku { id: string; brand: string; varian: string; }

interface Batch {
  id: string;
  tanggal_produksi: string;
  shift: string;
  status: string;
  jumlah_pack_rencana: number;
  created_at: string;
  produk_sku: { nama_brand: string; varian: string };
  users: { nama: string };
}

interface MasterResep {
  bahan_baku_id: string;
  jumlah_per_pack: number;
  satuan: string;
}

interface PenggunaanBahan {
  id: string;
  bahan_baku_id: string;
  jumlah_digunakan: number;
  satuan: string;
}

// ── Brands config ─────────────────────────────────────────────
const BRANDS_CONFIG = {
  cane: {
    label: "Cane RawtheR",
    color: "amber",
    variants: [
      { key: "original",      label: "Original",      varianDB: "Original" },
      { key: "melted_choco",  label: "Melted Choco",  varianDB: "Melted Choco" },
      { key: "grated_cheese", label: "Grated Cheese", varianDB: "Grated Cheese" },
      { key: "wholewheat",    label: "Whole Wheat",   varianDB: "Whole Wheat" },
    ],
  },
  mehana: {
    label: "Mehana Boga Utama",
    color: "blue",
    variants: [
      { key: "original", label: "Original", varianDB: "Original" },
      { key: "cokelat",  label: "Cokelat",  varianDB: "Cokelat" },
      { key: "keju",     label: "Keju",     varianDB: "Keju" },
    ],
  },
} as const;
type BrandKey = keyof typeof BRANDS_CONFIG;

// ── Kalender Indonesia ────────────────────────────────────────
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const NAMA_BULAN  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

const statusLabel: Record<string, string> = { adonan:"Adonan", packing:"Packing", freezer:"Freezer", selesai:"Selesai" };
const statusClass: Record<string, string> = { adonan:"badge-status-adonan", packing:"badge-status-packing", freezer:"badge-status-freezer", selesai:"badge-status-selesai" };

// ── Halaman Produksi ─────────────────────────────────────────
export default function ProduksiPage() {
  const user = getUserSession();

  const [skuList,   setSkuList]   = useState<ProdukSku[]>([]);
  const [batches,   setBatches]   = useState<Batch[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [sukses,    setSukses]    = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // form.varianKg: { [varianKey]: kg string }
  const [form, setForm] = useState<{
    tanggal: string;
    brand: BrandKey | "";
    varianKg: Record<string, string>;
  }>({ tanggal: today, brand: "", varianKg: {} });

  // ── Fetch ─────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const ch = supabase.channel("produksi-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_produksi" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchData() {
    const [skuRes, batchRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, varian").eq("aktif", true),
      supabase.from("batch_produksi")
        .select("id, tanggal_produksi, shift, status, jumlah_pack_rencana, created_at, produk_sku:produk_sku_id(nama_brand, varian), users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (skuRes.data)   setSkuList(skuRes.data);
    if (batchRes.data) setBatches(batchRes.data as unknown as Batch[]);
  }

  function getSkuId(brand: string, varianDB: string): string {
    return skuList.find((s) => s.brand === brand && s.varian === varianDB)?.id ?? "";
  }

  // ── Master resep & pemakaian helpers ─────────────────────
  async function fetchResep(skuId: string): Promise<MasterResep[]> {
    const { data } = await supabase.from("master_resep")
      .select("bahan_baku_id, jumlah_per_pack, satuan").eq("produk_sku_id", skuId);
    return (data as MasterResep[] | null) ?? [];
  }

  async function fetchPenggunaan(batchId: string): Promise<PenggunaanBahan[]> {
    const { data } = await supabase.from("penggunaan_bahan")
      .select("id, bahan_baku_id, jumlah_digunakan, satuan").eq("batch_produksi_id", batchId);
    return (data as PenggunaanBahan[] | null) ?? [];
  }

  async function applyIngredients(batchId: string, skuId: string, kgJumlah: number, tanggal: string) {
    if (!user) return;
    const resep = await fetchResep(skuId);
    for (const r of resep) {
      const jumlah = r.jumlah_per_pack * kgJumlah;
      await supabase.from("penggunaan_bahan").insert({
        batch_produksi_id: batchId, bahan_baku_id: r.bahan_baku_id,
        jumlah_digunakan: jumlah, satuan: r.satuan, created_by: user.id,
      });
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: r.bahan_baku_id, jumlah, satuan: r.satuan, tipe: "keluar",
        tanggal, keterangan: `Produksi batch #${batchId.slice(0, 8)}`, created_by: user.id,
      });
    }
  }

  async function restoreIngredients(batchId: string, tanggal: string) {
    if (!user) return;
    const penggunaan = await fetchPenggunaan(batchId);
    for (const p of penggunaan) {
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: p.bahan_baku_id, jumlah: p.jumlah_digunakan, satuan: p.satuan,
        tipe: "masuk", tanggal,
        keterangan: `Restore dari hapus/edit batch #${batchId.slice(0, 8)}`, created_by: user.id,
      });
    }
    if (penggunaan.length > 0) {
      await supabase.from("penggunaan_bahan").delete().eq("batch_produksi_id", batchId);
    }
  }

  // ── Grand total ───────────────────────────────────────────
  function grandTotal(): number {
    return Object.values(form.varianKg).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }

  // ── Open edit ─────────────────────────────────────────────
  function openEdit(b: Batch) {
    const namaBrand = (b.produk_sku as { nama_brand: string })?.nama_brand ?? "";
    const varianDB  = (b.produk_sku as { varian: string })?.varian ?? "";
    const brandKey: BrandKey | "" =
      namaBrand.toLowerCase().includes("cane")   ? "cane"   :
      namaBrand.toLowerCase().includes("mehana") ? "mehana" : "";

    if (!brandKey) return;
    const brandCfg = BRANDS_CONFIG[brandKey];
    const variantCfg = brandCfg.variants.find((v) => v.varianDB === varianDB);
    if (!variantCfg) return;

    setForm({
      tanggal:  b.tanggal_produksi,
      brand:    brandKey,
      varianKg: { [variantCfg.key]: String(b.jumlah_pack_rencana) },
    });
    setEditBatch(b);
    setSukses(false);
    setShowForm(true);
  }

  // ── Delete ────────────────────────────────────────────────
  async function handleDelete(id: string, tanggal: string) {
    if (!confirm("Hapus batch ini? Stok bahan baku akan dikembalikan.")) return;
    setDeleting(id);
    await restoreIngredients(id, tanggal);
    await supabase.from("batch_produksi").delete().eq("id", id);
    setDeleting(null);
    fetchData();
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.brand || !form.tanggal) return;

    const brandCfg = BRANDS_CONFIG[form.brand];
    const toProcess = brandCfg.variants.filter(
      (v) => parseFloat(form.varianKg[v.key] || "0") > 0
    );
    if (toProcess.length === 0) return;

    setLoading(true);

    if (editBatch) {
      // Edit: exactly one variant entry
      const v = toProcess[0];
      const kg = parseFloat(form.varianKg[v.key]);
      const skuId = getSkuId(form.brand, v.varianDB);
      if (skuId) {
        await restoreIngredients(editBatch.id, editBatch.tanggal_produksi);
        const { error } = await supabase.from("batch_produksi").update({
          tanggal_produksi: form.tanggal, jumlah_pack_rencana: kg,
          jumlah_pack_adonan: kg, updated_by: user.id,
        }).eq("id", editBatch.id);
        if (!error) await applyIngredients(editBatch.id, skuId, kg, form.tanggal);
      }
    } else {
      // New: one batch per variant with kg > 0
      for (const v of toProcess) {
        const kg = parseFloat(form.varianKg[v.key]);
        const skuId = getSkuId(form.brand, v.varianDB);
        if (!skuId) continue;
        const { data, error } = await supabase.from("batch_produksi").insert({
          produk_sku_id: skuId, tanggal_produksi: form.tanggal,
          shift: "pagi", jumlah_pack_rencana: kg, jumlah_pack_adonan: kg,
          status: "adonan", created_by: user.id,
        }).select("id").single();
        if (!error && data) await applyIngredients(data.id, skuId, kg, form.tanggal);
      }
    }

    setLoading(false);
    setSukses(true);
    setForm({ tanggal: today, brand: "", varianKg: {} });
    setEditBatch(null);
    fetchData();
    setTimeout(() => { setSukses(false); setShowForm(false); }, 1500);
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Produksi Adonan</h1>
        <button
          onClick={() => {
            setEditBatch(null);
            setForm({ tanggal: today, brand: "", varianKg: {} });
            setSukses(false);
            setShowForm(true);
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Buat Batch
        </button>
      </div>

      {/* Riwayat Batch */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ChefHat size={16} className="text-amber-500" />
          <span className="font-semibold text-gray-700">Riwayat Batch ({batches.length})</span>
        </div>
        {batches.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">Belum ada data produksi</p>
        ) : (
          <div className="space-y-3">
            {batches.map((b) => {
              const sku = b.produk_sku as { nama_brand: string; varian: string };
              return (
                <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{sku?.nama_brand}</p>
                      {sku?.varian && (
                        <p className="text-xs text-amber-600 font-medium mt-0.5">{sku.varian}</p>
                      )}
                    </div>
                    <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">{formatAngka(b.jumlah_pack_rencana)} kg</span>
                    {" · "}{formatTanggal(b.tanggal_produksi)}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                    <span>oleh {(b.users as { nama: string })?.nama}</span>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(b)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 hover:text-amber-600 transition-colors">
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => handleDelete(b.id, b.tanggal_produksi)}
                        disabled={deleting === b.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40">
                        <Trash2 size={12} /> {deleting === b.id ? "..." : "Hapus"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-800">{editBatch ? "Edit Batch" : "Buat Batch Baru"}</h2>
              <button onClick={() => { setShowForm(false); setEditBatch(null); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Tanggal */}
                <div>
                  <label className="label">Pilih Tanggal *</label>
                  <IndonesianDatePicker
                    value={form.tanggal}
                    onChange={(v) => setForm((f) => ({ ...f, tanggal: v }))}
                  />
                </div>

                {/* Brand */}
                <div>
                  <label className="label">Brand *</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(BRANDS_CONFIG) as [BrandKey, typeof BRANDS_CONFIG[BrandKey]][]).map(([key, cfg]) => (
                      <button key={key} type="button"
                        onClick={() => setForm((f) => ({ ...f, brand: key, varianKg: {} }))}
                        disabled={!!editBatch}
                        className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed ${
                          form.brand === key
                            ? cfg.color === "amber" ? "bg-amber-500 text-white border-amber-500" : "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}>
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Varian + kg inputs */}
                {form.brand && (() => {
                  const cfg = BRANDS_CONFIG[form.brand];
                  const total = grandTotal();
                  return (
                    <div className="space-y-3">
                      <label className="label">Jumlah Produksi per Varian (kg) *</label>
                      <div className="space-y-2">
                        {cfg.variants.map((v) => {
                          const isEditLocked = !!editBatch && !(v.key in form.varianKg);
                          return (
                            <div key={v.key}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                                isEditLocked ? "bg-gray-50 border-gray-100 opacity-40" :
                                parseFloat(form.varianKg[v.key] || "0") > 0
                                  ? "bg-amber-50 border-amber-200"
                                  : "bg-white border-gray-200"
                              }`}>
                              <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">{v.label}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number" step="0.1" min="0"
                                  disabled={isEditLocked}
                                  value={form.varianKg[v.key] ?? ""}
                                  onChange={(e) => setForm((f) => ({
                                    ...f,
                                    varianKg: { ...f.varianKg, [v.key]: e.target.value },
                                  }))}
                                  placeholder="0"
                                  className="input py-1.5 text-sm w-20 text-center disabled:opacity-30"
                                />
                                <span className="text-xs text-gray-400">kg</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Grand Total */}
                      {total > 0 && (
                        <div className="border-t-2 border-dashed border-gray-300 pt-3">
                          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-900 rounded-xl">
                            <span className="text-sm font-bold text-white tracking-wide">GRAND TOTAL</span>
                            <span className="text-lg font-bold text-amber-400">{formatAngka(total)} kg</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Info */}
                {form.brand && grandTotal() > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-0.5">
                      Stok bahan baku akan dikurangi otomatis berdasarkan Master Resep Adonan.
                    </p>
                    <p className="text-xs text-amber-600">Riwayat pemakaian akan tercatat di tab Riwayat Pemakaian.</p>
                  </div>
                )}

                {sukses && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-green-700 font-semibold text-sm">✓ Batch berhasil disimpan!</p>
                  </div>
                )}

                <button type="submit"
                  disabled={loading || !form.brand || !form.tanggal || grandTotal() <= 0}
                  className="btn-primary w-full py-3 text-base">
                  {loading ? "Menyimpan & mengurangi stok..." : editBatch ? "Simpan Perubahan" : "Simpan Batch"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kalender Indonesia ────────────────────────────────────────
function IndonesianDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void; }) {
  const todayDate = new Date();
  const initDate  = value ? new Date(value + "T00:00:00") : todayDate;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const selected = value ? new Date(value + "T00:00:00") : null;

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y-1); } else setViewMonth((m) => m-1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y+1); } else setViewMonth((m) => m+1); }

  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i+1)];

  function selectDay(day: number) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
  }
  function isSelected(day: number) { return selected !== null && selected.getDate() === day && selected.getMonth() === viewMonth && selected.getFullYear() === viewYear; }
  function isToday(day: number)    { return todayDate.getDate() === day && todayDate.getMonth() === viewMonth && todayDate.getFullYear() === viewYear; }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"><ChevronLeft size={18} /></button>
        <span className="font-bold text-gray-700 text-sm">{NAMA_BULAN[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {HARI_PENDEK.map((h) => <p key={h} className="text-center text-xs font-semibold text-gray-400 py-1">{h}</p>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) =>
          day === null ? <div key={`e-${i}`} /> : (
            <button key={day} type="button" onClick={() => selectDay(day)}
              className={`text-center text-sm py-1.5 rounded-lg font-medium transition-colors ${
                isSelected(day) ? "bg-amber-500 text-white shadow-sm" :
                isToday(day)    ? "bg-amber-100 text-amber-700" :
                "hover:bg-white hover:shadow-sm text-gray-700"
              }`}>{day}</button>
          )
        )}
      </div>
      {value && (
        <p className="text-center text-xs text-amber-600 font-semibold mt-3">
          {selected?.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
        </p>
      )}
    </div>
  );
}
