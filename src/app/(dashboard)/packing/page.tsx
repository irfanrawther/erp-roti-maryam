"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal, formatTanggalWaktu } from "@/lib/utils";
import { ChevronRight, ChevronLeft, X, CheckCircle, History, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface ProdukSku { id: string; brand: string; varian: string; }
interface MasterResep { bahan_baku_id: string; jumlah_per_pack: number; satuan: string; }
interface PenggunaanBahan { id: string; bahan_baku_id: string; jumlah_digunakan: number; satuan: string; }

interface Batch {
  id: string;
  produk_sku_id: string;
  tanggal_produksi: string;
  status: "adonan" | "bikin" | "packing" | "freezer" | "selesai";
  jumlah_pack_rencana: number;        // kg adonan
  jumlah_pack_adonan: number | null;  // actual pcs direndam
  jumlah_pack_packing: number | null;
  jumlah_pack_freezer: number | null;
  catatan_reject: string | null;
  status_updated_at: string;
  created_at: string;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number };
  users: { nama: string };
}

// ── Brand + varian config (gabungan resep adonan + rendam) ────
interface RendamBahan { nama: string; gr: number; }   // gram per kg adonan
interface VarianCfg   { key: string; label: string; varianDB: string; pcs_per_kg: number; wajibPcs?: boolean; rendam: RendamBahan[]; }
interface BrandCfg    { key: BrandKey; label: string; color: "amber" | "blue"; variants: VarianCfg[]; }
type BrandKey = "cane" | "mehana";

const BRANDS: Record<BrandKey, BrandCfg> = {
  cane: {
    key: "cane", label: "Cane RawtheR", color: "amber",
    variants: [
      { key: "original",      label: "Original",      varianDB: "Original",      pcs_per_kg: 20, rendam: [{ nama: "Margarine Blue Band", gr: 200 }] },
      { key: "melted_choco",  label: "Melted Choco",  varianDB: "Melted Choco",  pcs_per_kg: 25, wajibPcs: true, rendam: [{ nama: "Margarine Blue Band", gr: 200 }, { nama: "Mesis Tulip", gr: 500 }] },
      { key: "grated_cheese", label: "Grated Cheese", varianDB: "Grated Cheese", pcs_per_kg: 25, wajibPcs: true, rendam: [{ nama: "Margarine Blue Band", gr: 200 }, { nama: "Keju Kraft Martabak", gr: 500 }] },
      { key: "wholewheat",    label: "Whole Wheat",   varianDB: "Whole Wheat",   pcs_per_kg: 20, rendam: [{ nama: "Margarine Blue Band", gr: 120 }] },
    ],
  },
  mehana: {
    key: "mehana", label: "Mehana Boga Utama", color: "blue",
    variants: [
      { key: "original", label: "Original", varianDB: "Original", pcs_per_kg: 45, rendam: [{ nama: "Margarine Menara", gr: 225 }] },
      { key: "cokelat",  label: "Cokelat",  varianDB: "Cokelat",  pcs_per_kg: 45, rendam: [{ nama: "Margarine Menara", gr: 225 }, { nama: "Mesis Innova", gr: 320 }] },
      { key: "keju",     label: "Keju",     varianDB: "Keju",     pcs_per_kg: 45, rendam: [{ nama: "Margarine Menara", gr: 225 }, { nama: "Keju Calf", gr: 320 }] },
    ],
  },
};

function brandKeyFromNama(n: string): BrandKey | "" {
  const s = (n || "").toLowerCase();
  return s.includes("cane") ? "cane" : s.includes("mehana") ? "mehana" : "";
}
function findVarian(batch: Batch): (VarianCfg & { brandKey: BrandKey; brandLabel: string }) | null {
  const bk = brandKeyFromNama(batch.produk_sku?.nama_brand ?? "");
  if (!bk) return null;
  const v = BRANDS[bk].variants.find((x) => x.varianDB === batch.produk_sku?.varian);
  return v ? { ...v, brandKey: bk, brandLabel: BRANDS[bk].label } : null;
}

// ── Stage meta ────────────────────────────────────────────────
const STAGES = ["adonan", "bikin", "packing"] as const;
type Stage = typeof STAGES[number];
const statusLabel: Record<string, string> = {
  adonan: "Adonan", bikin: "Rendam", packing: "Packing & Freezer", freezer: "Packing & Freezer", selesai: "Selesai",
};
const statusClass: Record<string, string> = {
  adonan: "badge-status-adonan", bikin: "badge-status-bikin",
  packing: "badge-status-packing", freezer: "badge-status-packing", selesai: "badge-status-selesai",
};
const stageIcon: Record<string, string> = { adonan: "🥣", bikin: "💧", packing: "📦❄️" };

// ── Date helpers ──────────────────────────────────────────────
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const NAMA_BULAN  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
function localDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ── Konversi satuan resep → satuan stok ───────────────────────
function toBaseUnit(jumlah: number, satuan: string): { jumlah: number; satuan: string } {
  switch (satuan) {
    case "gr": return { jumlah: jumlah / 1000, satuan: "Kg" };
    case "ml": return { jumlah: jumlah / 1000, satuan: "Liter" };
    case "L":  return { jumlah, satuan: "Liter" };
    default:   return { jumlah, satuan };
  }
}

type RiwayatPreset = "hari_ini" | "kemarin" | "7hari" | "1bulan" | "custom";

export default function PackingPage() {
  const user = getUserSession();
  const today = localDateStr(new Date());

  const [skuList,     setSkuList]     = useState<ProdukSku[]>([]);
  const [bahanMap,    setBahanMap]    = useState<Record<string, string>>({});
  const [allBatches,  setAllBatches]  = useState<Batch[]>([]);
  const [activeTab,   setActiveTab]   = useState<Stage | "riwayat">("adonan");
  const [busy,        setBusy]        = useState(false);

  // Adonan input form
  const [adonanForm,  setAdonanForm]  = useState<{ tanggal: string; cane: Record<string, string>; mehana: Record<string, string> }>({ tanggal: today, cane: {}, mehana: {} });
  const [submitting,  setSubmitting]  = useState<BrandKey | null>(null);
  const [stockError,  setStockError]  = useState<string[]>([]);

  // Rendam modal
  const [rendamModal, setRendamModal] = useState<{ batch: Batch } | null>(null);
  const [rendamForm,  setRendamForm]  = useState({ pcs: "", catatan: "" });

  // Riwayat filter
  const [preset,      setPreset]      = useState<RiwayatPreset>("hari_ini");
  const [customStart, setCustomStart] = useState(today);
  const [customEnd,   setCustomEnd]   = useState(today);

  // ── Fetch ───────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const ch = supabase.channel("packing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_produksi" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchData() {
    const [skuRes, bahanRes, batchRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, varian").eq("aktif", true),
      supabase.from("bahan_baku").select("id, nama").eq("aktif", true),
      supabase.from("batch_produksi")
        .select("id, produk_sku_id, tanggal_produksi, status, jumlah_pack_rencana, jumlah_pack_adonan, jumlah_pack_packing, jumlah_pack_freezer, catatan_reject, status_updated_at, created_at, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack), users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(300),
    ]);
    if (skuRes.data) setSkuList(skuRes.data as ProdukSku[]);
    if (bahanRes.data) {
      const m: Record<string, string> = {};
      for (const b of bahanRes.data as { id: string; nama: string }[]) m[b.nama] = b.id;
      setBahanMap(m);
    }
    if (batchRes.data) setAllBatches(batchRes.data as unknown as Batch[]);
  }

  const active = allBatches.filter((b) => b.status !== "selesai");
  function countFor(stage: Stage) {
    if (stage === "packing") return active.filter((b) => b.status === "packing" || b.status === "freezer").length;
    return active.filter((b) => b.status === stage).length;
  }

  // ── Resep helpers (adonan) ──────────────────────────────────
  function getSkuId(brand: BrandKey, varianDB: string): string {
    const list = skuList.filter((s) => s.brand === brand);
    return list.find((s) => s.varian === varianDB)?.id ?? list[0]?.id ?? "";
  }
  async function fetchResep(skuId: string): Promise<MasterResep[]> {
    const { data } = await supabase.from("master_resep").select("bahan_baku_id, jumlah_per_pack, satuan").eq("produk_sku_id", skuId);
    return (data as MasterResep[] | null) ?? [];
  }
  async function applyIngredients(batchId: string, skuId: string, kg: number, tanggal: string) {
    if (!user) return;
    const resep = await fetchResep(skuId);
    for (const r of resep) {
      const { jumlah, satuan } = toBaseUnit(r.jumlah_per_pack * kg, r.satuan);
      await supabase.from("penggunaan_bahan").insert({ batch_produksi_id: batchId, bahan_baku_id: r.bahan_baku_id, jumlah_digunakan: jumlah, satuan, created_by: user.id });
      await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: r.bahan_baku_id, jumlah, satuan, tipe: "keluar", tanggal, keterangan: `Produksi batch #${batchId.slice(0, 8)}`, created_by: user.id });
    }
  }
  async function restoreIngredients(batchId: string, tanggal: string) {
    if (!user) return;
    const { data } = await supabase.from("penggunaan_bahan").select("id, bahan_baku_id, jumlah_digunakan, satuan").eq("batch_produksi_id", batchId);
    const list = (data as PenggunaanBahan[] | null) ?? [];
    for (const p of list) {
      await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: p.bahan_baku_id, jumlah: p.jumlah_digunakan, satuan: p.satuan, tipe: "masuk", tanggal, keterangan: `Restore adonan batch #${batchId.slice(0, 8)}`, created_by: user.id });
    }
    if (list.length) await supabase.from("penggunaan_bahan").delete().eq("batch_produksi_id", batchId);
  }
  async function validateStock(brandKey: BrandKey, kgMap: Record<string, string>): Promise<string[]> {
    const variants = BRANDS[brandKey].variants.filter((v) => parseFloat(kgMap[v.key] || "0") > 0);
    if (!variants.length) return [];
    const needed: Record<string, { jumlah: number; satuan: string }> = {};
    for (const v of variants) {
      const skuId = getSkuId(brandKey, v.varianDB);
      if (!skuId) continue;
      const resep = await fetchResep(skuId);
      const kg = parseFloat(kgMap[v.key]);
      for (const r of resep) {
        const { jumlah, satuan } = toBaseUnit(r.jumlah_per_pack * kg, r.satuan);
        if (!needed[r.bahan_baku_id]) needed[r.bahan_baku_id] = { jumlah: 0, satuan };
        needed[r.bahan_baku_id].jumlah += jumlah;
      }
    }
    const ids = Object.keys(needed);
    if (!ids.length) return [];
    const { data } = await supabase.from("bahan_baku").select("id, nama, stok_saat_ini, satuan").in("id", ids);
    const errors: string[] = [];
    for (const b of (data as { id: string; nama: string; stok_saat_ini: number; satuan: string }[] | null) ?? []) {
      const req = needed[b.id];
      if (req && b.stok_saat_ini < req.jumlah) {
        const butuh = req.jumlah.toFixed(3).replace(/\.?0+$/, "");
        const ada   = b.stok_saat_ini.toFixed(3).replace(/\.?0+$/, "");
        errors.push(`${b.nama}: butuh ${butuh} ${req.satuan}, stok ${ada} ${b.satuan}`);
      }
    }
    return errors;
  }

  // ── Rendam ingredient helpers (bahan tambahan) ──────────────
  async function applyRendam(batch: Batch, actualPcs: number) {
    if (!user) return;
    const cfg = findVarian(batch);
    if (!cfg) return;
    const effectiveKg = actualPcs / cfg.pcs_per_kg;
    const meta = JSON.stringify({ batchId: batch.id, brandKey: cfg.brandKey, brandLabel: cfg.brandLabel, varianKey: cfg.key, varianLabel: cfg.label, tanggal: batch.tanggal_produksi });
    for (const b of cfg.rendam) {
      const bahanId = bahanMap[b.nama];
      if (!bahanId) continue;
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: bahanId, jumlah: (b.gr * effectiveKg) / 1000, satuan: "Kg",
        tipe: "keluar", tanggal: batch.tanggal_produksi, keterangan: "proses_bikin::" + meta, created_by: user.id,
      });
    }
  }
  async function restoreRendam(batch: Batch) {
    if (!user) return;
    const { data } = await supabase.from("penerimaan_bahan_baku")
      .select("id, bahan_baku_id, jumlah, satuan")
      .like("keterangan", `proses_bikin::{"batchId":"${batch.id}"%`)
      .eq("tipe", "keluar");
    const rows = (data as { id: string; bahan_baku_id: string; jumlah: number; satuan: string }[] | null) ?? [];
    for (const r of rows) {
      await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: r.bahan_baku_id, jumlah: r.jumlah, satuan: r.satuan, tipe: "masuk", tanggal: batch.tanggal_produksi, keterangan: `Restore rendam batch #${batch.id.slice(0, 8)}`, created_by: user.id });
    }
    const ids = rows.map((r) => r.id);
    if (ids.length) await supabase.from("penerimaan_bahan_baku").delete().in("id", ids);
  }

  // ── Produk jadi stok (tanpa trigger — update langsung) ──────
  async function adjustProdukJadi(skuId: string, delta: number) {
    const { data } = await supabase.from("produk_sku").select("stok_saat_ini").eq("id", skuId).single();
    const cur = (data as { stok_saat_ini: number } | null)?.stok_saat_ini ?? 0;
    await supabase.from("produk_sku").update({ stok_saat_ini: Math.max(0, cur + delta) }).eq("id", skuId);
  }

  // ── STAGE 1: submit adonan ──────────────────────────────────
  async function submitAdonan(brandKey: BrandKey) {
    if (!user) return;
    const kgMap = brandKey === "cane" ? adonanForm.cane : adonanForm.mehana;
    const variants = BRANDS[brandKey].variants.filter((v) => parseFloat(kgMap[v.key] || "0") > 0);
    if (!variants.length) return;

    setSubmitting(brandKey);
    setStockError([]);
    const errors = await validateStock(brandKey, kgMap);
    if (errors.length) { setStockError(errors); setSubmitting(null); return; }

    for (const v of variants) {
      const kg = parseFloat(kgMap[v.key]);
      const skuId = getSkuId(brandKey, v.varianDB);
      if (!skuId) continue;
      const { data, error } = await supabase.from("batch_produksi").insert({
        produk_sku_id: skuId, tanggal_produksi: adonanForm.tanggal, shift: "pagi",
        jumlah_pack_rencana: kg, jumlah_pack_adonan: null, status: "adonan", created_by: user.id,
      }).select("id").single();
      if (!error && data) await applyIngredients((data as { id: string }).id, skuId, kg, adonanForm.tanggal);
    }
    setAdonanForm((f) => ({ ...f, [brandKey]: {} }));
    setSubmitting(null);
    fetchData();
  }

  async function deleteAdonan(batch: Batch) {
    if (!confirm(`Hapus adonan ${batch.produk_sku?.varian} (${formatAngka(batch.jumlah_pack_rencana)} kg)?\nStok bahan baku akan dikembalikan.`)) return;
    setBusy(true);
    await restoreIngredients(batch.id, batch.tanggal_produksi);
    await supabase.from("batch_produksi").delete().eq("id", batch.id);
    setBusy(false);
    fetchData();
  }

  // ── STAGE 2: Rendam ─────────────────────────────────────────
  function openRendam(batch: Batch) {
    setRendamForm({ pcs: "", catatan: "" });
    setRendamModal({ batch });
  }
  async function confirmRendam() {
    if (!user || !rendamModal) return;
    const actualPcs = parseInt(rendamForm.pcs);
    if (!actualPcs || actualPcs <= 0) return;
    setBusy(true);
    const { batch } = rendamModal;
    await applyRendam(batch, actualPcs);
    await supabase.from("batch_produksi").update({
      status: "bikin", jumlah_pack_adonan: actualPcs,
      catatan_reject: rendamForm.catatan || null, updated_by: user.id, status_updated_at: new Date().toISOString(),
    }).eq("id", batch.id);
    setBusy(false);
    setRendamModal(null);
    fetchData();
  }
  async function undoRendam(batch: Batch) {
    if (!confirm(`Kembalikan ${batch.produk_sku?.varian} ke Adonan?\nStok bahan rendam akan dikembalikan.`)) return;
    setBusy(true);
    await restoreRendam(batch);
    await supabase.from("batch_produksi").update({ status: "adonan", jumlah_pack_adonan: null, updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }

  // ── STAGE 3: Packing & Freezer ──────────────────────────────
  async function toPacking(batch: Batch) {
    const pcs = batch.jumlah_pack_adonan ?? 0;
    if (!confirm(`Pindahkan ${batch.produk_sku?.varian} ke Packing & Freezer?\n${formatAngka(pcs)} pcs akan ditambahkan ke stok produk jadi.`)) return;
    setBusy(true);
    await adjustProdukJadi(batch.produk_sku_id, pcs);
    await supabase.from("batch_produksi").update({ status: "packing", jumlah_pack_packing: pcs, updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }
  async function undoPacking(batch: Batch) {
    if (!confirm(`Kembalikan ${batch.produk_sku?.varian} ke Rendam?\nStok produk jadi akan dikurangi kembali.`)) return;
    setBusy(true);
    await adjustProdukJadi(batch.produk_sku_id, -(batch.jumlah_pack_adonan ?? 0));
    await supabase.from("batch_produksi").update({ status: "bikin", jumlah_pack_packing: null, updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }
  async function markSelesai(batch: Batch) {
    if (!confirm(`Tandai ${batch.produk_sku?.varian} sebagai Selesai?`)) return;
    setBusy(true);
    await supabase.from("batch_produksi").update({ status: "selesai", updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }

  // ── Riwayat range ───────────────────────────────────────────
  function riwayatRange(): { start: string; end: string } {
    const now = new Date();
    const f = localDateStr;
    switch (preset) {
      case "hari_ini": return { start: f(now), end: f(now) };
      case "kemarin":  { const y = addDays(now, -1); return { start: f(y), end: f(y) }; }
      case "7hari":    return { start: f(addDays(now, -6)), end: f(now) };
      case "1bulan":   return { start: f(addDays(now, -29)), end: f(now) };
      case "custom":   return { start: customStart || f(now), end: customEnd || f(now) };
    }
  }
  const { start: rStart, end: rEnd } = riwayatRange();
  const riwayat = allBatches.filter((b) => b.tanggal_produksi >= rStart && b.tanggal_produksi <= rEnd);

  // ── Render ──────────────────────────────────────────────────
  const tabActiveColor = (s: Stage | "riwayat") =>
    s === "adonan" ? "bg-yellow-100 text-yellow-800" :
    s === "bikin"  ? "bg-orange-100 text-orange-800" :
    s === "packing"? "bg-blue-100 text-blue-800" :
                     "bg-gray-800 text-white";

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">

      {/* Header + counter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">Packing & Freezer</h1>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <span key={s} className={statusClass[s]}>{statusLabel[s]}: {countFor(s)}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <button onClick={() => setActiveTab(s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${activeTab === s ? tabActiveColor(s) + " font-semibold" : "text-gray-400 hover:bg-gray-100"}`}>
              <span>{stageIcon[s]}</span><span>{statusLabel[s]}</span>
              {countFor(s) > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === s ? "bg-white/70" : "bg-gray-200 text-gray-600"}`}>{countFor(s)}</span>
              )}
            </button>
            {i < STAGES.length - 1 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
          </div>
        ))}
        <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />
        <button onClick={() => setActiveTab("riwayat")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 transition-all ${activeTab === "riwayat" ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-100"}`}>
          <History size={14} /> Riwayat
        </button>
      </div>

      {/* ════════ TAB: ADONAN ════════ */}
      {activeTab === "adonan" && (
        <div className="space-y-4">
          {/* Tanggal */}
          <div className="card">
            <label className="label">Tanggal Produksi</label>
            <IndonesianDatePicker value={adonanForm.tanggal} onChange={(v) => setAdonanForm((f) => ({ ...f, tanggal: v }))} />
          </div>

          {/* Error stok */}
          {stockError.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-red-700 font-semibold text-sm">⚠ Stok bahan baku tidak cukup:</p>
              {stockError.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {/* Input cards per brand */}
          {(Object.keys(BRANDS) as BrandKey[]).map((bk) => {
            const cfg = BRANDS[bk];
            const kgMap = bk === "cane" ? adonanForm.cane : adonanForm.mehana;
            const total = Object.values(kgMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const amber = cfg.color === "amber";
            return (
              <div key={bk} className={`rounded-2xl border-2 p-4 ${amber ? "border-amber-200" : "border-blue-200"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${amber ? "bg-amber-400" : "bg-blue-400"}`} />
                  <h2 className={`font-bold ${amber ? "text-amber-700" : "text-blue-700"}`}>{cfg.label}</h2>
                </div>
                <div className="space-y-2">
                  {cfg.variants.map((v) => {
                    const has = parseFloat(kgMap[v.key] || "0") > 0;
                    const activeCls = amber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
                    return (
                      <div key={v.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${has ? activeCls : "bg-white border-gray-200"}`}>
                        <span className="text-sm font-semibold text-gray-700 flex-1 min-w-0">{v.label}</span>
                        <input type="number" step="0.1" min="0" placeholder="0"
                          className="input py-1.5 text-sm w-20 text-center"
                          value={kgMap[v.key] ?? ""}
                          onChange={(e) => setAdonanForm((f) => ({ ...f, [bk]: { ...kgMap, [v.key]: e.target.value } }))} />
                        <span className="text-xs text-gray-400 shrink-0">kg</span>
                      </div>
                    );
                  })}
                </div>
                {total > 0 && (
                  <div className="flex items-center justify-between mt-3 px-3 py-2 bg-gray-900 rounded-xl">
                    <span className="text-xs font-bold text-white tracking-wide">GRAND TOTAL</span>
                    <span className="text-base font-bold text-amber-400">{formatAngka(total)} kg</span>
                  </div>
                )}
                <button onClick={() => submitAdonan(bk)} disabled={submitting === bk || total <= 0}
                  className={`w-full mt-3 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 ${amber ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"}`}>
                  {submitting === bk ? "Menyimpan & cek stok..." : `Simpan Adonan ${cfg.label}`}
                </button>
              </div>
            );
          })}

          {/* List adonan aktif */}
          <StageList
            title="Adonan Aktif"
            batches={active.filter((b) => b.status === "adonan")}
            renderActions={(b) => (
              <div className="flex gap-2">
                <button onClick={() => openRendam(b)} className="btn-primary flex-1 text-sm py-2">Pindah ke Rendam</button>
                <button onClick={() => deleteAdonan(b)} disabled={busy}
                  className="flex items-center justify-center gap-1 px-3 text-sm py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                  <Trash2 size={14} /> Hapus
                </button>
              </div>
            )}
          />
        </div>
      )}

      {/* ════════ TAB: RENDAM ════════ */}
      {activeTab === "bikin" && (
        <StageList
          title="Rendam"
          batches={active.filter((b) => b.status === "bikin")}
          renderActions={(b) => (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => toPacking(b)} disabled={busy} className="btn-primary flex-1 text-sm py-2">Pindah ke Packing &amp; Freezer</button>
              <button onClick={() => undoRendam(b)} disabled={busy}
                className="flex items-center justify-center gap-1.5 flex-1 text-sm py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                <ChevronLeft size={15} /> Kembali ke Adonan
              </button>
            </div>
          )}
        />
      )}

      {/* ════════ TAB: PACKING & FREEZER ════════ */}
      {activeTab === "packing" && (
        <StageList
          title="Packing & Freezer"
          batches={active.filter((b) => b.status === "packing" || b.status === "freezer")}
          renderActions={(b) => (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => markSelesai(b)} disabled={busy} className="btn-primary flex-1 text-sm py-2">Tandai Selesai</button>
              <button onClick={() => undoPacking(b)} disabled={busy}
                className="flex items-center justify-center gap-1.5 flex-1 text-sm py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                <ChevronLeft size={15} /> Kembali ke Rendam
              </button>
            </div>
          )}
        />
      )}

      {/* ════════ TAB: RIWAYAT ════════ */}
      {activeTab === "riwayat" && (
        <div className="space-y-3">
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {([["hari_ini","Hari ini"],["kemarin","Kemarin"],["7hari","7 Hari"],["1bulan","1 Bulan"],["custom","Custom"]] as [RiwayatPreset,string][]).map(([k, lbl]) => (
                <button key={k} onClick={() => setPreset(k)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${preset === k ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{lbl}</button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <input type="date" className="input text-sm py-1.5 flex-1" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <span className="text-gray-400 text-sm">s/d</span>
                <input type="date" className="input text-sm py-1.5 flex-1" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <History size={16} className="text-amber-500" />
              <span className="font-semibold text-gray-700">Riwayat Produksi ({riwayat.length})</span>
            </div>
            {riwayat.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Tidak ada data pada rentang ini</p>
            ) : (
              <div className="space-y-2.5">
                {riwayat.map((b) => {
                  const sku = b.produk_sku as { nama_brand: string; varian: string };
                  return (
                    <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{sku?.nama_brand} — {sku?.varian}</p>
                          <p className="text-xs text-gray-400">{formatTanggal(b.tanggal_produksi)}</p>
                        </div>
                        <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs mt-2">
                        <span className="bg-gray-50 rounded px-2 py-1"><span className="text-gray-400">Adonan</span> <b className="text-gray-700">{formatAngka(b.jumlah_pack_rencana)} kg</b></span>
                        {b.jumlah_pack_adonan != null && (
                          <span className="bg-orange-50 rounded px-2 py-1"><span className="text-orange-400">Direndam</span> <b className="text-orange-700">{formatAngka(b.jumlah_pack_adonan)} pcs</b></span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">oleh {(b.users as { nama: string })?.nama} · {formatTanggalWaktu(b.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ MODAL: RENDAM ════════ */}
      {rendamModal && (() => {
        const batch = rendamModal.batch;
        const cfg = findVarian(batch);
        const kg = batch.jumlah_pack_rencana;
        const standar = cfg ? Math.round(kg * cfg.pcs_per_kg) : 0;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
                <h2 className="font-bold text-gray-800">Pindah ke Rendam</h2>
                <button onClick={() => setRendamModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="font-medium text-gray-800">{batch.produk_sku?.nama_brand} — {batch.produk_sku?.varian}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className={statusClass.adonan}>Adonan</span> {" → "} <span className={statusClass.bikin}>Rendam</span>
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adonan</p>
                  <p className="text-base font-bold text-gray-800">{formatAngka(kg)} kg</p>
                  <p className="text-xs text-gray-400">data dari input Adonan</p>
                </div>

                {standar > 0 && cfg && (
                  <div className="bg-amber-50 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Standar</span>
                      <span className="text-base font-bold text-amber-700">{formatAngka(standar)} pcs</span>
                    </div>
                    <p className="text-xs text-amber-500">{cfg.pcs_per_kg} pcs/kg × {formatAngka(kg)} kg{cfg.wajibPcs ? " · WAJIB 25 pcs (65gr/pcs)" : ""}</p>
                  </div>
                )}

                <div>
                  <label className="label">Total Jumlah Direndam (Actual)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" placeholder="0" className="input flex-1 text-lg font-semibold"
                      value={rendamForm.pcs} onChange={(e) => setRendamForm((f) => ({ ...f, pcs: e.target.value }))} />
                    <span className="text-sm font-semibold text-gray-500 shrink-0">Pcs</span>
                  </div>
                </div>

                <div>
                  <label className="label">Catatan <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea rows={2} className="input resize-none" placeholder="Catatan tambahan..."
                    value={rendamForm.catatan} onChange={(e) => setRendamForm((f) => ({ ...f, catatan: e.target.value }))} />
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setRendamModal(null)} className="btn-secondary flex-1">Batal</button>
                  <button onClick={confirmRendam} disabled={busy || !parseInt(rendamForm.pcs)}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> {busy ? "Memproses..." : "Konfirmasi"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ── StageList: kartu batch per stage ──────────────────────────
function StageList({ title, batches, renderActions }: {
  title: string;
  batches: Batch[];
  renderActions: (b: Batch) => React.ReactNode;
}) {
  return (
    <div className="card">
      <h2 className="font-semibold text-sm mb-3 text-gray-700">{title} ({batches.length})</h2>
      {batches.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">Belum ada batch di stage ini</p>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const sku = b.produk_sku as { nama_brand: string; varian: string };
            return (
              <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-800">{sku?.nama_brand} — {sku?.varian}</p>
                    <p className="text-xs text-gray-400">{formatTanggal(b.tanggal_produksi)} · oleh {(b.users as { nama: string })?.nama}</p>
                  </div>
                  <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3 text-xs">
                  <span className="bg-gray-50 rounded px-2.5 py-1.5"><span className="text-gray-400">Adonan</span> <b className="text-gray-700">{formatAngka(b.jumlah_pack_rencana)} kg</b></span>
                  {b.jumlah_pack_adonan != null && (
                    <span className="bg-orange-50 rounded px-2.5 py-1.5"><span className="text-orange-400">Direndam</span> <b className="text-orange-700">{formatAngka(b.jumlah_pack_adonan)} pcs</b></span>
                  )}
                </div>
                {renderActions(b)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Kalender Indonesia ────────────────────────────────────────
function IndonesianDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const todayDate = new Date();
  const initDate = value ? new Date(value + "T00:00:00") : todayDate;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const selected = value ? new Date(value + "T00:00:00") : null;

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); }

  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function selectDay(day: number) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
  }
  const isSelected = (day: number) => selected !== null && selected.getDate() === day && selected.getMonth() === viewMonth && selected.getFullYear() === viewYear;
  const isToday = (day: number) => todayDate.getDate() === day && todayDate.getMonth() === viewMonth && todayDate.getFullYear() === viewYear;

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"><ChevronLeft size={18} /></button>
        <span className="font-bold text-gray-700 text-sm">{NAMA_BULAN[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"><ChevronRight size={18} /></button>
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
                isToday(day) ? "bg-amber-100 text-amber-700" : "hover:bg-white hover:shadow-sm text-gray-700"
              }`}>{day}</button>
          )
        )}
      </div>
    </div>
  );
}
