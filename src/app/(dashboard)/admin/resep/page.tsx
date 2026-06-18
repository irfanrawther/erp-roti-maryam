"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { X, ShieldAlert, BookOpen, ChevronRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface ProdukSku { id: string; brand: string; varian: string; }
interface BahanBaku { id: string; nama: string; }
interface ResepItem {
  id: string; produk_sku_id: string;
  bahan_baku_id: string; jumlah_per_pack: number; satuan: string;
  label: string | null;
}
interface ResepBikinItem {
  id: string; produk_sku_id: string;
  bahan_baku_id: string; jumlah_per_kg: number; satuan: string;
}
interface FormRow {
  bahan_baku_id: string; nama: string; jumlah: string; satuan: string;
}

interface ModalState {
  canonicalId: string;
  brand: "cane" | "mehana";
  groupLabel: string;
  namaList: string[];
  satuanOpts: string[];
  modalType: "adonan" | "bikin";
}

// ── Konstanta Resep Adonan ────────────────────────────────────
const BAHAN_CANE_REGULAR: string[] = [
  "Terigu", "Margarine Blue Band", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam", "Telur", "Baking Powder",
];
const BAHAN_CANE_WW: string[] = [
  "Terigu", "Margarine Blue Band", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam", "Telur", "Baking Powder", "Tepung Gandum",
];
const BAHAN_MEHANA: string[] = [
  "Terigu", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam",
];
const SATUAN_CANE   = ["ml", "gr", "kg", "liter", "pcs"];
const SATUAN_MEHANA = ["ml", "gr", "kg", "liter"];

const CANE_GROUPS = [
  { key: "original",      label: "Original",      bahan: BAHAN_CANE_REGULAR, matchVarian: (v: string) => v === "Original" },
  { key: "melted_choco",  label: "Melted Choco",  bahan: BAHAN_CANE_REGULAR, matchVarian: (v: string) => v === "Melted Choco" },
  { key: "grated_cheese", label: "Grated Cheese", bahan: BAHAN_CANE_REGULAR, matchVarian: (v: string) => v === "Grated Cheese" },
  { key: "wholewheat",    label: "Whole Wheat",   bahan: BAHAN_CANE_WW,      matchVarian: (v: string) => v === "Whole Wheat" },
] as const;

const MEHANA_GROUPS = [
  { key: "original", label: "Original", bahan: BAHAN_MEHANA, matchVarian: (v: string) => v === "Original" },
  { key: "cokelat",  label: "Cokelat",  bahan: BAHAN_MEHANA, matchVarian: (v: string) => v === "Cokelat" },
  { key: "keju",     label: "Keju",     bahan: BAHAN_MEHANA, matchVarian: (v: string) => v === "Keju" },
] as const;

// ── Konstanta Resep Bikin (bahan per pcs saat rendam) ─────────
const RESEP_BIKIN_CANE = [
  { key: "original",      label: "Original",      matchVarian: (v: string) => v === "Original",      bahan: ["Margarine Blue Band"] },
  { key: "melted_choco",  label: "Melted Choco",  matchVarian: (v: string) => v === "Melted Choco",  bahan: ["Margarine Blue Band", "Mesis Tulip"] },
  { key: "grated_cheese", label: "Grated Cheese", matchVarian: (v: string) => v === "Grated Cheese", bahan: ["Margarine Blue Band", "Keju Kraft Martabak"] },
  { key: "wholewheat",    label: "Whole Wheat",   matchVarian: (v: string) => v === "Whole Wheat",   bahan: ["Margarine Blue Band"] },
] as const;

const RESEP_BIKIN_MEHANA = [
  { key: "original", label: "Original", matchVarian: (v: string) => v === "Original", bahan: ["Margarine Menara"] },
  { key: "cokelat",  label: "Cokelat",  matchVarian: (v: string) => v === "Cokelat",  bahan: ["Margarine Menara", "Mesis Innova"] },
  { key: "keju",     label: "Keju",     matchVarian: (v: string) => v === "Keju",     bahan: ["Margarine Menara", "Keju Calf"] },
] as const;

// ── Halaman ───────────────────────────────────────────────────
export default function AdminResepPage() {
  const router = useRouter();
  const me     = getUserSession();

  const [topTab,       setTopTab]       = useState<"adonan" | "bikin">("adonan");
  const [skuList,      setSkuList]      = useState<ProdukSku[]>([]);
  const [bahanList,    setBahanList]    = useState<BahanBaku[]>([]);
  const [resepMap,     setResepMap]     = useState<Record<string, ResepItem[]>>({});
  const [bikinResepMap,setBikinResepMap]= useState<Record<string, ResepBikinItem[]>>({});

  const [modal,     setModal]     = useState<ModalState | null>(null);
  const [formRows,  setFormRows]  = useState<FormRow[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [saveOk,    setSaveOk]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!me || !canAccessAdmin(me.role)) { router.replace(homeRoute(me)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [skuRes, bahanRes, resepRes, bikinRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, varian").eq("aktif", true),
      supabase.from("bahan_baku").select("id, nama").eq("aktif", true).order("nama"),
      supabase.from("master_resep").select("id, produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan, label"),
      supabase.from("resep_bikin").select("id, produk_sku_id, bahan_baku_id, jumlah_per_kg, satuan"),
    ]);
    if (skuRes.data)   setSkuList(skuRes.data);
    if (bahanRes.data) setBahanList(bahanRes.data);
    if (resepRes.data) {
      const map: Record<string, ResepItem[]> = {};
      for (const r of resepRes.data as ResepItem[]) {
        if (!map[r.produk_sku_id]) map[r.produk_sku_id] = [];
        map[r.produk_sku_id].push(r);
      }
      setResepMap(map);
    }
    if (bikinRes.error) {
      console.error("[resep_bikin] fetch error:", bikinRes.error.message);
    }
    // Always update bikinResepMap (even if empty) so UI stays in sync
    const bikinMap: Record<string, ResepBikinItem[]> = {};
    for (const r of (bikinRes.data ?? []) as ResepBikinItem[]) {
      if (!bikinMap[r.produk_sku_id]) bikinMap[r.produk_sku_id] = [];
      bikinMap[r.produk_sku_id].push(r);
    }
    setBikinResepMap(bikinMap);
  }

  function getSkuId(brand: "cane" | "mehana", matchVarian?: (v: string) => boolean): string {
    const list = skuList.filter((s) => s.brand === brand);
    const found = matchVarian ? list.find((s) => matchVarian(s.varian)) : list[0];
    return found?.id ?? "";
  }

  function matchBahan(nama: string): BahanBaku | undefined {
    return bahanList.find((b) =>
      b.nama.toLowerCase().includes(nama.toLowerCase()) ||
      nama.toLowerCase().includes(b.nama.toLowerCase())
    );
  }

  function jumlahTersimpanAdonan(skuId: string, namaList: readonly string[]): number {
    if (!skuId) return 0;
    const savedLabels = new Set((resepMap[skuId] ?? []).map((r) => r.label ?? r.bahan_baku_id));
    return namaList.filter((nama) => savedLabels.has(nama)).length;
  }

  function jumlahTersimpanBikin(skuId: string, namaList: readonly string[]): number {
    if (!skuId) return 0;
    const savedIds = new Set((bikinResepMap[skuId] ?? []).map((r) => r.bahan_baku_id));
    return namaList.filter((nama) => {
      const db = matchBahan(nama);
      return db && savedIds.has(db.id);
    }).length;
  }

  function openModal(
    modalType: "adonan" | "bikin",
    brand: "cane" | "mehana",
    groupLabel: string,
    namaList: readonly string[],
    satuanOpts: string[],
    matchVarian?: (v: string) => boolean
  ) {
    const skuId    = getSkuId(brand, matchVarian);
    if (modalType === "adonan") {
      const existing = skuId ? (resepMap[skuId] ?? []) : [];
      const rows: FormRow[] = namaList.map((nama) => {
        const db    = matchBahan(nama);
        // Match by label (display name) — supports same bahan_baku_id with different labels
        const saved = existing.find((e) => (e.label ?? "") === nama) ?? existing.find((e) => db && e.bahan_baku_id === db.id && !e.label);
        return { bahan_baku_id: db?.id ?? "", nama, jumlah: saved ? String(saved.jumlah_per_pack) : "", satuan: saved?.satuan ?? "" };
      });
      setFormRows(rows);
    } else {
      const existing = skuId ? (bikinResepMap[skuId] ?? []) : [];
      const rows: FormRow[] = namaList.map((nama) => {
        const db    = matchBahan(nama);
        const saved = db ? existing.find((e) => e.bahan_baku_id === db.id) : undefined;
        return { bahan_baku_id: db?.id ?? "", nama, jumlah: saved ? String(saved.jumlah_per_kg) : "", satuan: "gr" };
      });
      setFormRows(rows);
    }
    setModal({ canonicalId: skuId, brand, groupLabel, namaList: [...namaList], satuanOpts, modalType });
    setSaveOk(false);
  }

  function closeModal() { setModal(null); setFormRows([]); setSaveOk(false); setSaveError(null); }

  function updateRow(idx: number, field: "jumlah" | "satuan", value: string) {
    setFormRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setSaveOk(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (!me || !modal?.canonicalId) return;
    setSaving(true);
    setSaveOk(false);
    setSaveError(null);

    const errors: string[] = [];

    if (modal.modalType === "adonan") {
      const existing = resepMap[modal.canonicalId] ?? [];
      for (const row of formRows) {
        if (!row.bahan_baku_id) continue;
        // Match existing row by label (display name) — enables Minyak Resep & Minyak Rendam as separate rows
        const rec      = existing.find((e) => (e.label ?? "") === row.nama) ?? existing.find((e) => e.bahan_baku_id === row.bahan_baku_id && !e.label);
        const hasValue = row.jumlah.trim() !== "" && parseFloat(row.jumlah) > 0 && row.satuan !== "";
        if (hasValue) {
          if (rec) {
            const { error } = await supabase.from("master_resep").update({ jumlah_per_pack: parseFloat(row.jumlah), satuan: row.satuan, label: row.nama }).eq("id", rec.id);
            if (error) errors.push(`Update ${row.nama}: ${error.message}`);
          } else {
            const { error } = await supabase.from("master_resep").insert({ produk_sku_id: modal.canonicalId, bahan_baku_id: row.bahan_baku_id, jumlah_per_pack: parseFloat(row.jumlah), satuan: row.satuan, label: row.nama, keterangan: null, created_by: me.id });
            if (error) errors.push(`Insert ${row.nama}: ${error.message}`);
          }
        } else if (rec) {
          const { error } = await supabase.from("master_resep").delete().eq("id", rec.id);
          if (error) errors.push(`Delete ${row.nama}: ${error.message}`);
        }
      }
    } else {
      const existing = bikinResepMap[modal.canonicalId] ?? [];
      for (const row of formRows) {
        if (!row.bahan_baku_id) continue;
        const rec      = existing.find((e) => e.bahan_baku_id === row.bahan_baku_id);
        const hasValue = row.jumlah.trim() !== "" && parseFloat(row.jumlah) > 0;
        if (hasValue) {
          if (rec) {
            const { error } = await supabase.from("resep_bikin").update({ jumlah_per_kg: parseFloat(row.jumlah) }).eq("id", rec.id);
            if (error) errors.push(`Update ${row.nama}: ${error.message}`);
          } else {
            const { error } = await supabase.from("resep_bikin").insert({ produk_sku_id: modal.canonicalId, bahan_baku_id: row.bahan_baku_id, jumlah_per_kg: parseFloat(row.jumlah), satuan: "gr", created_by: me.id });
            if (error) errors.push(`Insert ${row.nama}: ${error.message}`);
          }
        } else if (rec) {
          const { error } = await supabase.from("resep_bikin").delete().eq("id", rec.id);
          if (error) errors.push(`Delete ${row.nama}: ${error.message}`);
        }
      }
    }

    await fetchAll();
    setSaving(false);
    if (errors.length > 0) {
      setSaveError(errors.join(" | "));
    } else {
      setSaveOk(true);
    }
  }

  if (!me || !canAccessAdmin(me.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center"><ShieldAlert size={32} className="text-red-400 mx-auto mb-2" /><p className="text-gray-500">Akses ditolak</p></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Master Resep</h1>

      {/* Top tab toggle */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        <button
          onClick={() => setTopTab("adonan")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${topTab === "adonan" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Resep Adonan
        </button>
        <button
          onClick={() => setTopTab("bikin")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${topTab === "bikin" ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          Resep Bikin
        </button>
      </div>

      {/* ── TAB: RESEP ADONAN ── */}
      {topTab === "adonan" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Bahan baku per 1 kg adonan untuk setiap varian produk.</p>

          {/* Cane RawtheR */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <p className="font-bold text-gray-700">Cane RawtheR</p>
            </div>
            <div className="space-y-2">
              {CANE_GROUPS.map((grp) => {
                const skuId  = getSkuId("cane", grp.matchVarian);
                const jumlah = jumlahTersimpanAdonan(skuId, grp.bahan);
                const filled = jumlah > 0;
                return (
                  <button key={grp.key}
                    onClick={() => openModal("adonan", "cane", grp.label, grp.bahan, SATUAN_CANE, grp.matchVarian)}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{grp.label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {filled ? `${jumlah} / ${grp.bahan.length} bahan` : "Belum diisi"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mehana Boga Utama */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
              <p className="font-bold text-gray-700">Mehana Boga Utama</p>
            </div>
            <div className="space-y-2">
              {MEHANA_GROUPS.map((grp) => {
                const skuId  = getSkuId("mehana", grp.matchVarian);
                const jumlah = jumlahTersimpanAdonan(skuId, grp.bahan);
                const filled = jumlah > 0;
                return (
                  <button key={grp.key}
                    onClick={() => openModal("adonan", "mehana", grp.label, grp.bahan, SATUAN_MEHANA, grp.matchVarian)}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{grp.label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {filled ? `${jumlah} / ${grp.bahan.length} bahan` : "Belum diisi"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: RESEP BIKIN ── */}
      {topTab === "bikin" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Bahan baku per kg standar adonan saat proses rendam. Kalkulasi otomatis: gr/kg ÷ standar pcs/kg × actual pcs = pemakaian bahan.</p>

          {/* Cane RawtheR */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <p className="font-bold text-gray-700">Cane RawtheR</p>
            </div>
            <div className="space-y-2">
              {RESEP_BIKIN_CANE.map((grp) => {
                const skuId  = getSkuId("cane", grp.matchVarian);
                const jumlah = jumlahTersimpanBikin(skuId, grp.bahan);
                const filled = jumlah > 0;
                return (
                  <button key={grp.key}
                    onClick={() => openModal("bikin", "cane", grp.label, grp.bahan, [], grp.matchVarian)}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{grp.label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {filled ? `${jumlah} / ${grp.bahan.length} bahan` : "Belum diisi"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mehana Boga Utama */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
              <p className="font-bold text-gray-700">Mehana Boga Utama</p>
            </div>
            <div className="space-y-2">
              {RESEP_BIKIN_MEHANA.map((grp) => {
                const skuId  = getSkuId("mehana", grp.matchVarian);
                const jumlah = jumlahTersimpanBikin(skuId, grp.bahan);
                const filled = jumlah > 0;
                return (
                  <button key={grp.key}
                    onClick={() => openModal("bikin", "mehana", grp.label, grp.bahan, [], grp.matchVarian)}
                    className="w-full flex items-center justify-between bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{grp.label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {filled ? `${jumlah} / ${grp.bahan.length} bahan` : "Belum diisi"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className={modal.modalType === "bikin" ? "text-blue-500" : "text-amber-500"} />
                <div>
                  <p className="font-bold text-gray-800 leading-tight text-sm">{modal.groupLabel}</p>
                  <p className="text-xs text-gray-400">
                    {modal.brand === "cane" ? "Cane RawtheR" : "Mehana Boga Utama"}
                    {" · "}
                    {modal.modalType === "bikin" ? "Resep Bikin (gr/kg adonan)" : "Resep Mixing Adonan"}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {/* Header kolom */}
              {modal.modalType === "adonan" ? (
                <div className="grid grid-cols-[1fr_90px_80px] gap-2 px-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bahan</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">per 1kg</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Satuan</p>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_90px_60px] gap-2 px-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bahan</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">gr/kg</p>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Satuan</p>
                </div>
              )}

              {/* Baris */}
              <div className="space-y-1.5">
                {formRows.map((row, idx) => (
                  <div key={row.bahan_baku_id || row.nama}
                    className="grid grid-cols-[1fr_90px_80px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                    <p className={`text-sm font-medium leading-tight ${!row.bahan_baku_id ? "text-gray-300" : "text-gray-800"}`}>
                      {row.nama}
                      {!row.bahan_baku_id && <span className="block text-[10px] text-red-400">tidak ditemukan di DB</span>}
                    </p>
                    <input type="number" step="0.001" min="0" placeholder="—"
                      disabled={!row.bahan_baku_id} value={row.jumlah}
                      onChange={(e) => updateRow(idx, "jumlah", e.target.value)}
                      className="input text-center text-sm py-1.5 disabled:bg-gray-100 disabled:text-gray-300" />
                    {modal.modalType === "adonan" ? (
                      <select disabled={!row.bahan_baku_id} value={row.satuan}
                        onChange={(e) => updateRow(idx, "satuan", e.target.value)}
                        className="input text-sm py-1.5 text-center disabled:bg-gray-100 disabled:text-gray-300">
                        <option value="">—</option>
                        {modal.satuanOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <div className="flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-lg px-2 py-2">gr</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {modal.modalType === "bikin" && (
                <p className="text-xs text-gray-400 px-1">
                  Pemakaian = (gr/kg ÷ standar pcs/kg) × actual pcs ÷ 1000 = Kg
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-600 font-medium">Gagal menyimpan:</p>
                  <p className="text-xs text-red-500 mt-0.5 break-all">{saveError}</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                {saveOk && <p className="text-sm text-green-600 font-medium flex-1">✓ Tersimpan!</p>}
                <button onClick={closeModal} className="btn-secondary">Tutup</button>
                <button onClick={handleSave} disabled={saving} className={`btn-primary flex-1 ${modal.modalType === "bikin" ? "!bg-blue-500 hover:!bg-blue-600" : ""}`}>
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
