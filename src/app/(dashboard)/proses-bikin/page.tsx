"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatTanggal } from "@/lib/utils";
import { ChevronDown, ChevronUp, Pencil, Trash2, History, CheckCircle2, X } from "lucide-react";

// ─── Resep hardcoded ──────────────────────────────────────────
interface Bahan  { nama: string; gram_per_kg: number; }
interface Varian { key: string; label: string; pcs_per_kg: number; bahan: Bahan[]; }
interface Brand  { key: string; label: string; color: "amber" | "blue"; variants: Varian[]; }

const BRANDS: Brand[] = [
  {
    key: "cane", label: "Cane RawtheR", color: "amber",
    variants: [
      { key: "original",      label: "Original",      pcs_per_kg: 20, bahan: [{ nama: "Margarine Blue Band", gram_per_kg: 200 }] },
      { key: "melted_choco",  label: "Melted Choco",  pcs_per_kg: 25, bahan: [{ nama: "Margarine Blue Band", gram_per_kg: 200 }, { nama: "Mesis Tulip",          gram_per_kg: 500 }] },
      { key: "grated_cheese", label: "Grated Cheese", pcs_per_kg: 25, bahan: [{ nama: "Margarine Blue Band", gram_per_kg: 200 }, { nama: "Keju Kraft Martabak", gram_per_kg: 500 }] },
      { key: "wholewheat",    label: "Whole Wheat",   pcs_per_kg: 20, bahan: [{ nama: "Margarine Blue Band", gram_per_kg: 120 }] },
    ],
  },
  {
    key: "mehana", label: "Mehana Boga Utama", color: "blue",
    variants: [
      { key: "original", label: "Original", pcs_per_kg: 45, bahan: [{ nama: "Margarine Menara", gram_per_kg: 225 }] },
      { key: "cokelat",  label: "Cokelat",  pcs_per_kg: 45, bahan: [{ nama: "Margarine Menara", gram_per_kg: 225 }, { nama: "Mesis Innova", gram_per_kg: 320 }] },
      { key: "keju",     label: "Keju",     pcs_per_kg: 45, bahan: [{ nama: "Margarine Menara", gram_per_kg: 225 }, { nama: "Keju Calf",   gram_per_kg: 320 }] },
    ],
  },
];

// ─── Date helpers ─────────────────────────────────────────────
const NAMA_BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const CY = new Date().getFullYear();
const YEAR_OPTS = [CY - 1, CY, CY + 1];
function daysInMonth(m: number, y: number) { return new Date(y, m, 0).getDate(); }
function toIso(h: string, b: string, t: string) {
  return `${t}-${b.padStart(2,"0")}-${h.padStart(2,"0")}`;
}

// ─── State per brand ──────────────────────────────────────────
interface BrandFormState {
  hari: string;
  bulan: string;
  tahun: string;
  kgMap:  Record<string, string>; // kg adonan per varian
  pcsMap: Record<string, string>; // jumlah real pcs per varian
  loadingKey: string | null;
  suksesKey:  string | null;
}

function initBrandState(): BrandFormState {
  const d = new Date();
  return {
    hari:  String(d.getDate()),
    bulan: String(d.getMonth() + 1),
    tahun: String(d.getFullYear()),
    kgMap:  {},
    pcsMap: {},
    loadingKey: null,
    suksesKey:  null,
  };
}

// ─── Riwayat types ────────────────────────────────────────────
interface RiwayatItem  { id: string; bahan_baku_id: string; nama_bahan: string; jumlah: number; satuan: string; }
interface RiwayatGroup { batchId: string; brandKey: string; brandLabel: string; varianKey: string; varianLabel: string; tanggal: string; created_at: string; items: RiwayatItem[]; }

// ─── Edit modal ───────────────────────────────────────────────
interface EditModal { grp: RiwayatGroup; brand: Brand; varian: Varian; hari: string; bulan: string; tahun: string; kg: string; }

// ─── keterangan encoding ──────────────────────────────────────
function buildMeta(batchId: string, brandKey: string, brandLabel: string, varianKey: string, varianLabel: string, tanggal: string) {
  return "proses_bikin::" + JSON.stringify({ batchId, brandKey, brandLabel, varianKey, varianLabel, tanggal });
}
function parseMeta(k: string | null) {
  if (!k?.startsWith("proses_bikin::")) return null;
  try { return JSON.parse(k.slice("proses_bikin::".length)) as { batchId:string; brandKey:string; brandLabel:string; varianKey:string; varianLabel:string; tanggal:string; }; }
  catch { return null; }
}
function randomId() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

// ─── Page ─────────────────────────────────────────────────────
export default function ProsesBikinPage() {
  const user = getUserSession();

  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [brandForm, setBrandForm] = useState<Record<string, BrandFormState>>({});
  const [bahanMap,  setBahanMap]  = useState<Record<string, string>>({}); // nama → id
  const [riwayat,   setRiwayat]   = useState<RiwayatGroup[]>([]);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editSaving,setEditSaving]= useState(false);
  const [editSukses,setEditSukses]= useState(false);

  // ── Fetch ──────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [bahanRes, riwRes] = await Promise.all([
      supabase.from("bahan_baku").select("id,nama").eq("aktif", true),
      supabase.from("penerimaan_bahan_baku")
        .select("id,bahan_baku_id,jumlah,satuan,keterangan,created_at,bahan_baku:bahan_baku_id(nama)")
        .like("keterangan","proses_bikin::%")
        .order("created_at",{ ascending: false })
        .limit(500),
    ]);

    if (bahanRes.data) {
      const m: Record<string,string> = {};
      for (const b of bahanRes.data) m[b.nama] = b.id;
      setBahanMap(m);
    }

    if (riwRes.data) {
      const groups: Record<string,RiwayatGroup> = {};
      for (const row of riwRes.data as unknown as Array<{
        id:string; bahan_baku_id:string; jumlah:number; satuan:string;
        keterangan:string; created_at:string; bahan_baku:{ nama:string }|null;
      }>) {
        const meta = parseMeta(row.keterangan);
        if (!meta) continue;
        if (!groups[meta.batchId]) {
          groups[meta.batchId] = { ...meta, created_at: row.created_at, items: [] };
        }
        groups[meta.batchId].items.push({
          id: row.id, bahan_baku_id: row.bahan_baku_id,
          nama_bahan: row.bahan_baku?.nama ?? row.bahan_baku_id,
          jumlah: row.jumlah, satuan: row.satuan,
        });
      }
      setRiwayat(Object.values(groups).sort((a,b) => b.created_at.localeCompare(a.created_at)));
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Brand form helpers ─────────────────────────────────────
  function getForm(brandKey: string): BrandFormState {
    return brandForm[brandKey] ?? initBrandState();
  }
  function setForm(brandKey: string, patch: Partial<BrandFormState>) {
    setBrandForm(prev => ({ ...prev, [brandKey]: { ...getForm(brandKey), ...patch } }));
  }
  function setKg(brandKey: string, varianKey: string, val: string) {
    const f = getForm(brandKey);
    setForm(brandKey, { kgMap: { ...f.kgMap, [varianKey]: val } });
  }
  function setPcs(brandKey: string, varianKey: string, val: string) {
    const f = getForm(brandKey);
    setForm(brandKey, { pcsMap: { ...f.pcsMap, [varianKey]: val } });
  }

  // ── Submit varian ──────────────────────────────────────────
  async function handleSubmit(brand: Brand, varian: Varian) {
    if (!user) return;
    const f    = getForm(brand.key);
    const kgN  = parseFloat(f.kgMap[varian.key]  ?? "");
    const pcsN = parseFloat(f.pcsMap[varian.key] ?? "");
    // Butuh minimal salah satu
    if ((!kgN || kgN <= 0) && (!pcsN || pcsN <= 0)) return;

    // Kalau pcs real diisi → pakai pcs/pcs_per_kg sebagai dasar kg efektif
    const effectiveKg = pcsN > 0 ? pcsN / varian.pcs_per_kg : kgN;

    setForm(brand.key, { loadingKey: varian.key, suksesKey: null });

    const tanggal    = toIso(f.hari, f.bulan, f.tahun);
    const batchId    = randomId();
    const keterangan = buildMeta(batchId, brand.key, brand.label, varian.key, varian.label, tanggal);

    for (const b of varian.bahan) {
      const bahanId = bahanMap[b.nama];
      if (!bahanId) continue;
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: bahanId,
        jumlah:        (b.gram_per_kg * effectiveKg) / 1000,
        satuan:        "Kg",
        tipe:          "keluar",
        tanggal,
        keterangan,
        created_by:    user.id,
      });
    }

    await fetchAll();
    setForm(brand.key, {
      loadingKey: null, suksesKey: varian.key,
      kgMap:  { ...f.kgMap,  [varian.key]: "" },
      pcsMap: { ...f.pcsMap, [varian.key]: "" },
    });
    setTimeout(() => setForm(brand.key, { suksesKey: null }), 2000);
  }

  // ── Restore stok: insert "masuk" untuk setiap item sebelum dihapus ──
  async function restoreStok(items: RiwayatItem[], tanggal: string, note: string) {
    if (!user || items.length === 0) return;
    for (const item of items) {
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: item.bahan_baku_id,
        jumlah:        item.jumlah,
        satuan:        item.satuan,
        tipe:          "masuk",
        tanggal,
        keterangan:    note,
        created_by:    user.id,
      });
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  async function handleDelete(grp: RiwayatGroup) {
    if (!confirm(`Hapus proses bikin ${grp.varianLabel} (${formatTanggal(grp.tanggal)})?\nStok bahan akan dikembalikan.`)) return;
    setDeleting(grp.batchId);
    // 1. Restore stok dulu via INSERT masuk (trigger DB butuh INSERT, bukan DELETE)
    await restoreStok(grp.items, grp.tanggal, `Restore hapus proses bikin ${grp.varianLabel}`);
    // 2. Baru hapus record keluar-nya
    const ids = grp.items.map(it => it.id);
    if (ids.length) await supabase.from("penerimaan_bahan_baku").delete().in("id", ids);
    await fetchAll();
    setDeleting(null);
  }

  // ── Open edit modal ────────────────────────────────────────
  function openEdit(grp: RiwayatGroup) {
    const brand  = BRANDS.find(b => b.key === grp.brandKey);
    const varian = brand?.variants.find(v => v.key === grp.varianKey);
    if (!brand || !varian) return;
    const [t,b,h] = grp.tanggal.split("-");
    setEditModal({ grp, brand, varian, tahun:t, bulan:String(parseInt(b)), hari:String(parseInt(h)), kg:"" });
    setEditSukses(false);
  }

  // ── Save edit ──────────────────────────────────────────────
  async function handleEditSave() {
    if (!editModal || !user) return;
    const kgN = parseFloat(editModal.kg);
    if (!kgN || kgN <= 0) return;

    setEditSaving(true);

    // 1. Restore stok dari record lama (INSERT masuk dulu — trigger DB hanya fire saat INSERT)
    await restoreStok(
      editModal.grp.items,
      editModal.grp.tanggal,
      `Restore edit proses bikin ${editModal.varian.label}`,
    );
    // 2. Hapus record lama
    const ids = editModal.grp.items.map(it => it.id);
    if (ids.length) await supabase.from("penerimaan_bahan_baku").delete().in("id", ids);

    const tanggal    = toIso(editModal.hari, editModal.bulan, editModal.tahun);
    const keterangan = buildMeta(editModal.grp.batchId, editModal.brand.key, editModal.brand.label, editModal.varian.key, editModal.varian.label, tanggal);

    for (const b of editModal.varian.bahan) {
      const bahanId = bahanMap[b.nama];
      if (!bahanId) continue;
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: bahanId,
        jumlah:        (b.gram_per_kg * kgN) / 1000,
        satuan:        "Kg",
        tipe:          "keluar",
        tanggal,
        keterangan,
        created_by:    user.id,
      });
    }

    await fetchAll();
    setEditSaving(false);
    setEditSukses(true);
    setTimeout(() => setEditModal(null), 1500);
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-5 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Proses Bikin</h1>

      {/* Brand cards */}
      {BRANDS.map((brand) => {
        const isOpen = openBrand === brand.key;
        const amber  = brand.color === "amber";
        const f      = getForm(brand.key);
        const days   = daysInMonth(parseInt(f.bulan), parseInt(f.tahun));

        return (
          <div key={brand.key}
            className={`rounded-2xl border-2 transition-colors ${
              isOpen
                ? amber ? "border-amber-300 bg-amber-50" : "border-blue-300 bg-blue-50"
                : "border-gray-100 bg-white"
            }`}>

            {/* Toggle header */}
            <button className="w-full flex items-center justify-between px-5 py-4"
              onClick={() => setOpenBrand(isOpen ? null : brand.key)}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${amber ? "bg-amber-400" : "bg-blue-400"}`} />
                <span className={`font-bold text-base ${
                  isOpen ? amber ? "text-amber-700" : "text-blue-700" : "text-gray-800"
                }`}>{brand.label}</span>
              </div>
              {isOpen
                ? <ChevronUp  size={20} className={amber ? "text-amber-600" : "text-blue-600"} />
                : <ChevronDown size={20} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-5 space-y-4">

                {/* Date picker */}
                <div>
                  <p className="label mb-1">Tanggal</p>
                  <div className="grid grid-cols-3 gap-2">
                    <select className="input text-sm" value={f.hari}
                      onChange={e => setForm(brand.key, { hari: e.target.value })}>
                      {Array.from({ length: days }, (_,i) => i+1).map(d =>
                        <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className="input text-sm" value={f.bulan}
                      onChange={e => setForm(brand.key, { bulan: e.target.value, hari:"1" })}>
                      {NAMA_BULAN.map((n,i) =>
                        <option key={i+1} value={i+1}>{n}</option>)}
                    </select>
                    <select className="input text-sm" value={f.tahun}
                      onChange={e => setForm(brand.key, { tahun: e.target.value, hari:"1" })}>
                      {YEAR_OPTS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {/* Variants inline */}
                <div className="space-y-3">
                  {brand.variants.map((varian) => {
                    const kg     = f.kgMap[varian.key]  ?? "";
                    const pcs    = f.pcsMap[varian.key] ?? "";
                    const kgN    = parseFloat(kg);
                    const pcsN   = parseFloat(pcs);
                    const isLoad = f.loadingKey === varian.key;
                    const isOk   = f.suksesKey  === varian.key;

                    const hasKg  = kgN  > 0;
                    const hasPcs = pcsN > 0;
                    // kg efektif untuk kalkulasi real
                    const realKg = hasPcs ? pcsN / varian.pcs_per_kg : 0;

                    function fmtGr(gram: number) {
                      return gram >= 1000 ? `${(gram/1000).toFixed(3)} Kg` : `${gram.toFixed(1)} gr`;
                    }

                    return (
                      <div key={varian.key}
                        className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">

                        {/* Baris 1: nama + dua input + submit */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 leading-tight">{varian.label}</p>
                            <p className="text-xs text-gray-400">{varian.pcs_per_kg} pcs/kg</p>
                          </div>
                          {/* Input kg */}
                          <div className="flex flex-col items-center gap-0.5">
                            <input
                              type="number" step="0.1" min="0" placeholder="kg"
                              className="input w-20 text-center font-semibold text-sm"
                              value={kg}
                              onChange={e => setKg(brand.key, varian.key, e.target.value)}
                            />
                            <span className="text-[10px] text-gray-400">kg adonan</span>
                          </div>
                          {/* Input pcs real */}
                          <div className="flex flex-col items-center gap-0.5">
                            <input
                              type="number" step="1" min="0" placeholder="pcs"
                              className={`input w-20 text-center font-semibold text-sm ${hasPcs ? "border-green-400 ring-1 ring-green-200" : ""}`}
                              value={pcs}
                              onChange={e => setPcs(brand.key, varian.key, e.target.value)}
                            />
                            <span className="text-[10px] text-gray-400">pcs real</span>
                          </div>
                          <button
                            disabled={isLoad || (!hasKg && !hasPcs)}
                            onClick={() => handleSubmit(brand, varian)}
                            className={`shrink-0 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 ${
                              amber ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"
                            }`}>
                            {isLoad ? "..." : "Submit"}
                          </button>
                        </div>

                        {/* Kalkulasi */}
                        {(hasKg || hasPcs) && (
                          <div className="space-y-1">
                            {/* Standar — dari kg adonan */}
                            {hasKg && (
                              <div className={`rounded-lg px-3 py-2 space-y-1 ${hasPcs ? "opacity-50" : ""} ${amber ? "bg-amber-50" : "bg-blue-50"}`}>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                  Standar{hasPcs ? " (diganti real)" : ""}
                                </p>
                                {varian.bahan.map((b, i) => (
                                  <p key={b.nama} className="text-xs text-gray-600 leading-snug">
                                    {i > 0 && <span className="text-gray-400 mr-1">+</span>}
                                    <span className="font-medium">{b.gram_per_kg}gr</span>{" "}{b.nama}{" × "}{kgN} kg
                                    <span className={`font-bold ml-1 ${amber ? "text-amber-700" : "text-blue-700"}`}>
                                      = {fmtGr(b.gram_per_kg * kgN)}
                                    </span>
                                  </p>
                                ))}
                              </div>
                            )}
                            {/* Real — dari pcs */}
                            {hasPcs && (
                              <div className="rounded-lg px-3 py-2 space-y-1 bg-green-50 border border-green-200">
                                <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">
                                  Pemakaian Real · {pcsN} pcs ÷ {varian.pcs_per_kg} = {realKg.toFixed(3)} kg efektif
                                </p>
                                {varian.bahan.map((b, i) => (
                                  <p key={b.nama} className="text-xs text-gray-700 leading-snug">
                                    {i > 0 && <span className="text-gray-400 mr-1">+</span>}
                                    <span className="font-medium">{b.gram_per_kg}gr</span>{" "}{b.nama}{" × "}{realKg.toFixed(3)} kg
                                    <span className="font-bold ml-1 text-green-700">
                                      = {fmtGr(b.gram_per_kg * realKg)}
                                    </span>
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sukses */}
                        {isOk && (
                          <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                            <CheckCircle2 size={14} /> Berhasil disimpan!
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Riwayat */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-amber-500" />
          <span className="font-semibold text-gray-700">Riwayat Proses Bikin ({riwayat.length})</span>
        </div>

        {riwayat.length === 0
          ? <p className="text-sm text-gray-400 text-center py-6">Belum ada data proses bikin</p>
          : (
            <div className="space-y-3">
              {riwayat.map((grp) => (
                <div key={grp.batchId} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{grp.brandLabel}</p>
                      <p className="text-xs text-amber-600 font-medium">{grp.varianLabel}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTanggal(grp.tanggal)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(grp)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-amber-50 hover:text-amber-600 text-gray-400 transition-colors">
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => handleDelete(grp)} disabled={deleting === grp.batchId}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors disabled:opacity-40">
                        <Trash2 size={12} /> {deleting === grp.batchId ? "..." : "Hapus"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {grp.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-gray-500">
                        <span>{item.nama_bahan}</span>
                        <span className="font-medium text-gray-700">{item.jumlah} {item.satuan}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-800">{editModal.varian.label}</p>
                <p className="text-xs text-gray-400">{editModal.brand.label} · Edit Proses</p>
              </div>
              <button onClick={() => setEditModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Date */}
              <div>
                <label className="label">Tanggal</label>
                <div className="grid grid-cols-3 gap-2">
                  <select className="input text-sm" value={editModal.hari}
                    onChange={e => setEditModal(m => m ? { ...m, hari: e.target.value } : m)}>
                    {Array.from({ length: daysInMonth(parseInt(editModal.bulan), parseInt(editModal.tahun)) }, (_,i) => i+1)
                      .map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="input text-sm" value={editModal.bulan}
                    onChange={e => setEditModal(m => m ? { ...m, bulan: e.target.value, hari:"1" } : m)}>
                    {NAMA_BULAN.map((n,i) => <option key={i+1} value={i+1}>{n}</option>)}
                  </select>
                  <select className="input text-sm" value={editModal.tahun}
                    onChange={e => setEditModal(m => m ? { ...m, tahun: e.target.value, hari:"1" } : m)}>
                    {YEAR_OPTS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Kg */}
              <div>
                <label className="label">Jumlah adonan (kg)</label>
                <input type="number" step="0.1" min="0" placeholder="0" className="input text-lg font-semibold"
                  value={editModal.kg}
                  onChange={e => setEditModal(m => m ? { ...m, kg: e.target.value } : m)} />
              </div>

              {/* Calc */}
              {parseFloat(editModal.kg) > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  {editModal.varian.bahan.map((b,i) => {
                    const totalGr = b.gram_per_kg * parseFloat(editModal.kg);
                    const display = totalGr >= 1000 ? `${(totalGr/1000).toFixed(2)} Kg` : `${totalGr.toFixed(0)} gr`;
                    return (
                      <p key={b.nama} className="text-xs text-gray-600">
                        {i > 0 && <span className="text-gray-400 mr-1">+</span>}
                        <span className="font-medium">{b.gram_per_kg}gr</span> {b.nama} × {editModal.kg} kg
                        <span className="font-bold text-gray-800 ml-1">= {display}</span>
                      </p>
                    );
                  })}
                </div>
              )}

              {editSukses && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-green-700 font-semibold text-sm">Berhasil diupdate!</p>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setEditModal(null)} className="btn-secondary flex-none px-5">Batal</button>
              <button
                onClick={handleEditSave}
                disabled={editSaving || !parseFloat(editModal.kg)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 ${
                  editModal.brand.color === "amber" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"
                }`}>
                {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
