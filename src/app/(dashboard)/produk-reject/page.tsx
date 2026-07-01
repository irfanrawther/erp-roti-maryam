"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { formatAngka } from "@/lib/utils";
import { AlertTriangle, Store, RotateCcw, ChevronLeft, ChevronRight, Pencil, Check, X } from "lucide-react";
import { RiwayatFilter, getRiwayatRange, ID_MONTHS } from "@/components/RiwayatFilter";
import type { RiwayatPreset } from "@/components/RiwayatFilter";

interface RejectStok {
  id: string; brand: string; varian: string; pcs_per_pack: number; stok_pcs: number;
}
interface SaleRow {
  id: string; reject_id: string; brand: string; varian: string;
  jumlah_pack: number; jumlah_pcs: number; tanggal_keluar: string;
}

const BRAND_CONFIG = [
  { brand: "cane",   label: "Cane RawtheR",     color: "amber" as const, variants: ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"] },
  { brand: "mehana", label: "Mehana Boga Utama", color: "blue"  as const, variants: ["Original", "Cokelat", "Keju"] },
] as const;

const TOKO = "Olmoz Store";

export default function ProdukRejectPage() {
  const user     = getUserSession();
  const router   = useRouter();
  const caps     = getCapabilities(user);
  const readOnly = user?.role === "spv"; // SPV: hanya lihat, tidak bisa jual/reset/undo
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  useEffect(() => {
    if (user && !caps.produkReject) router.replace(homeRoute(user));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab,      setActiveTab]      = useState<"jual" | "laporan">("jual");
  const [rejectList,     setRejectList]     = useState<RejectStok[]>([]);
  const [allSales,       setAllSales]       = useState<SaleRow[]>([]);
  const [busy,           setBusy]           = useState(false);
  const [toast,          setToast]          = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetBusy,      setResetBusy]      = useState(false);
  const [showUndoModal,  setShowUndoModal]  = useState(false);
  const [undoBusy,       setUndoBusy]       = useState(false);
  const [editStokId,     setEditStokId]     = useState<string | null>(null);
  const [editStokVal,    setEditStokVal]    = useState("");
  const [savingStok,     setSavingStok]     = useState(false);

  // Form state
  const [packForm,   setPackForm]   = useState<Record<string, string>>({});
  const [tanggal,    setTanggal]    = useState(todayStr);
  const [keterangan, setKeterangan] = useState("");

  // Laporan filter
  const [preset,        setPreset]        = useState<RiwayatPreset>("hari_ini");
  const [customStart,   setCustomStart]   = useState("");
  const [customEnd,     setCustomEnd]     = useState("");
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    fetchReject();
    const ch = supabase.channel("produk-reject-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stok_produk_reject" }, fetchReject)
      .on("postgres_changes", { event: "*", schema: "public", table: "penjualan_reject" }, fetchSales)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line

  useEffect(() => { fetchSales(); }, [preset, customStart, customEnd, selectedBulan]); // eslint-disable-line

  async function fetchReject() {
    const { data } = await supabase.from("stok_produk_reject")
      .select("id, brand, varian, pcs_per_pack, stok_pcs").eq("aktif", true);
    if (data) setRejectList(data as RejectStok[]);
  }

  async function fetchSales() {
    const { start, end } = getRiwayatRange(preset, customStart, customEnd, selectedBulan);
    const { data } = await supabase.from("penjualan_reject")
      .select("id, reject_id, brand, varian, jumlah_pack, jumlah_pcs, tanggal_keluar")
      .gte("tanggal_keluar", start).lte("tanggal_keluar", end);
    if (data) setAllSales(data as SaleRow[]);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 4000); }

  function rowFor(brand: string, varian: string): RejectStok | undefined {
    return rejectList.find((r) => r.brand === brand && r.varian === varian);
  }

  function openEditStok(row: RejectStok) {
    setEditStokId(row.id);
    setEditStokVal(String(row.stok_pcs));
  }

  async function saveEditStok(id: string) {
    const nilai = parseInt(editStokVal);
    if (isNaN(nilai) || nilai < 0) return;
    setSavingStok(true);
    const { error } = await supabase.from("stok_produk_reject")
      .update({ stok_pcs: nilai, updated_at: new Date().toISOString() }).eq("id", id);
    setSavingStok(false);
    if (!error) {
      setRejectList((list) => list.map((r) => (r.id === id ? { ...r, stok_pcs: nilai } : r)));
      setEditStokId(null);
    }
  }

  async function handleSubmit() {
    if (!user) return;
    const entries = Object.entries(packForm).filter(([, v]) => parseInt(v) > 0);
    if (!entries.length) return;

    // Validasi stok cukup
    for (const [id, val] of entries) {
      const row = rejectList.find((r) => r.id === id);
      if (!row) continue;
      const pcs = parseInt(val) * row.pcs_per_pack;
      if (pcs > row.stok_pcs) {
        showToast(`❌ Stok tidak cukup: ${row.varian} (butuh ${pcs} pcs, tersedia ${row.stok_pcs} pcs)`);
        return;
      }
    }

    setBusy(true);
    let err = false;
    for (const [id, val] of entries) {
      const row = rejectList.find((r) => r.id === id);
      if (!row) continue;
      const pack = parseInt(val);
      const pcs  = pack * row.pcs_per_pack;
      const { error } = await supabase.from("penjualan_reject").insert({
        reject_id: row.id, brand: row.brand, varian: row.varian,
        jumlah_pack: pack, jumlah_pcs: pcs, toko: TOKO,
        tanggal_keluar: tanggal, keterangan: keterangan || null, created_by: user.id,
      });
      if (error) { err = true; continue; }
      // potong stok
      await supabase.from("stok_produk_reject")
        .update({ stok_pcs: Math.max(0, row.stok_pcs - pcs), updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    setBusy(false);
    if (!err) {
      setPackForm({}); setKeterangan("");
      const totalPack = entries.reduce((s, [, v]) => s + parseInt(v), 0);
      showToast(`✓ Penjualan reject dicatat (${totalPack} pack ke ${TOKO})`);
      fetchReject(); fetchSales();
    } else {
      showToast("❌ Ada error, coba lagi");
    }
  }

  const totalPackForm = Object.values(packForm).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const salesPackForReject = (id: string) => allSales.filter((p) => p.reject_id === id).reduce((s, p) => s + p.jumlah_pack, 0);
  const salesPcsForReject  = (id: string) => allSales.filter((p) => p.reject_id === id).reduce((s, p) => s + p.jumlah_pcs, 0);

  async function doReset() {
    setResetBusy(true);
    // Kembalikan stok dari semua penjualan, lalu hapus
    const { data } = await supabase.from("penjualan_reject").select("reject_id, jumlah_pcs");
    const rows = (data as { reject_id: string; jumlah_pcs: number }[] | null) ?? [];
    const restore: Record<string, number> = {};
    for (const r of rows) restore[r.reject_id] = (restore[r.reject_id] ?? 0) + r.jumlah_pcs;
    for (const [id, pcs] of Object.entries(restore)) {
      const cur = rejectList.find((r) => r.id === id)?.stok_pcs ?? 0;
      await supabase.from("stok_produk_reject").update({ stok_pcs: cur + pcs }).eq("id", id);
    }
    await supabase.from("penjualan_reject").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setPackForm({}); setKeterangan(""); setActiveTab("jual");
    setShowResetModal(false);
    setResetBusy(false);
    showToast("Data penjualan reject direset & stok dikembalikan.");
    fetchReject(); fetchSales();
  }

  // Undo: hapus HANYA penjualan hari ini (tanggal = hari ini), stok dikembalikan
  async function doUndoToday() {
    setUndoBusy(true);
    const { data } = await supabase.from("penjualan_reject")
      .select("id, reject_id, jumlah_pcs")
      .eq("tanggal_keluar", todayStr);
    const rows = (data as { id: string; reject_id: string; jumlah_pcs: number }[] | null) ?? [];
    if (rows.length === 0) {
      setUndoBusy(false);
      setShowUndoModal(false);
      showToast("Tidak ada penjualan reject hari ini.");
      return;
    }
    // Kembalikan stok per reject
    const restore: Record<string, number> = {};
    for (const r of rows) restore[r.reject_id] = (restore[r.reject_id] ?? 0) + r.jumlah_pcs;
    for (const [id, pcs] of Object.entries(restore)) {
      const cur = rejectList.find((r) => r.id === id)?.stok_pcs ?? 0;
      await supabase.from("stok_produk_reject").update({ stok_pcs: cur + pcs }).eq("id", id);
    }
    await supabase.from("penjualan_reject").delete().in("id", rows.map((r) => r.id));
    setShowUndoModal(false);
    setUndoBusy(false);
    showToast(`✓ Penjualan hari ini dibatalkan (${rows.length} input) & stok dikembalikan.`);
    fetchReject(); fetchSales();
  }

  function periodLabel() {
    if (preset === "hari_ini") return "Hari ini";
    if (preset === "kemarin") return "Kemarin";
    if (preset === "7hari") return "7 hari terakhir";
    if (preset === "1bulan") return "1 bulan terakhir";
    if (preset === "bulan") { const [y, m] = selectedBulan.split("-").map(Number); return `${ID_MONTHS[m - 1]} ${y}`; }
    if (customStart && customEnd) return `${customStart} s/d ${customEnd}`;
    return "Custom";
  }

  const tabs = [
    { key: "jual",    label: "Stok & Jual" },
    { key: "laporan", label: "Laporan Penjualan" },
  ] as const;

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-xs">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-red-500" />
          <h1 className="text-xl font-bold text-gray-800">Produk Reject</h1>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer">
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === t.key ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: STOK & JUAL ══════════ */}
      {activeTab === "jual" && (
        <div className="space-y-4">

          {/* ───── STOK PRODUK REJECT (read-only) ───── */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-500" /> Stok Produk Reject
              </h2>
              {!readOnly && (
                <button type="button" onClick={() => setShowUndoModal(true)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors">
                  <RotateCcw size={11} /> Undo Penjualan Hari Ini
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BRAND_CONFIG.map(bc => {
                const isAmber = bc.color === "amber";
                return (
                  <div key={bc.brand} className={`rounded-xl border p-3 space-y-1.5 ${isAmber ? "border-amber-100 bg-amber-50/40" : "border-blue-100 bg-blue-50/40"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isAmber ? "text-amber-600" : "text-blue-600"}`}>{bc.label}</p>
                    {bc.variants.map(v => {
                      const row = rowFor(bc.brand, v);
                      if (!row) return null;
                      return (
                        <div key={v} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                          <span className="text-xs text-gray-700 font-medium">{v} <span className="text-gray-400 font-normal">(isi {row.pcs_per_pack} pcs)</span></span>
                          {editStokId === row.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number" step="1" min="0" autoFocus
                                value={editStokVal} onChange={(e) => setEditStokVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveEditStok(row.id); if (e.key === "Escape") setEditStokId(null); }}
                                className="input py-0.5 text-sm w-16 text-center font-bold"
                              />
                              <span className="text-[10px] text-gray-400">pcs</span>
                              <button type="button" onClick={() => saveEditStok(row.id)} disabled={savingStok || editStokVal === ""}
                                className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 shrink-0">
                                {savingStok ? <span className="text-[9px]">…</span> : <Check size={11} />}
                              </button>
                              <button type="button" onClick={() => setEditStokId(null)}
                                className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0">
                                <X size={11} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className={`text-sm font-bold ${row.stok_pcs > 0 ? "text-gray-800" : "text-gray-300"}`}>{formatAngka(row.stok_pcs)} pcs</span>
                              {!readOnly && (
                                <button type="button" onClick={() => openEditStok(row)}
                                  className="p-0.5 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors shrink-0"
                                  title="Set stok langsung">
                                  <Pencil size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ───── INPUT PENJUALAN ───── */}
          {!readOnly && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <Store size={15} className="text-red-500" /> Penjualan {TOKO}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="label">Tanggal *</label>
                <IndonesianDatePicker value={tanggal} onChange={setTanggal} />
              </div>
              <div>
                <label className="label">Keterangan</label>
                <input type="text" className="input" placeholder="Catatan..." value={keterangan} onChange={e => setKeterangan(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BRAND_CONFIG.map(bc => {
                const isAmber = bc.color === "amber";
                return (
                  <div key={bc.brand} className={`rounded-xl border p-3 space-y-2 ${isAmber ? "border-amber-100 bg-amber-50/40" : "border-blue-100 bg-blue-50/40"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isAmber ? "text-amber-600" : "text-blue-600"}`}>{bc.label}</p>
                    {bc.variants.map(v => {
                      const row = rowFor(bc.brand, v);
                      if (!row) return null;
                      const pack = parseInt(packForm[row.id] || "0") || 0;
                      const pcs  = pack * row.pcs_per_pack;
                      const over = pcs > row.stok_pcs;
                      return (
                        <div key={v} className="space-y-0.5">
                          <span className="text-xs text-gray-700 font-medium block">{v} <span className="text-gray-400 font-normal">(isi {row.pcs_per_pack} pcs)</span></span>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" placeholder=""
                              className={`input flex-1 text-right text-sm py-1 ${over ? "border-red-300" : ""}`}
                              value={packForm[row.id] ?? ""}
                              onChange={e => setPackForm(f => ({ ...f, [row.id]: e.target.value }))} />
                            <span className="text-xs text-gray-400 shrink-0">pack</span>
                          </div>
                          {pack > 0 && (
                            <p className={`text-[10px] ${over ? "text-red-500" : "text-gray-400"}`}>
                              = {formatAngka(pcs)} pcs ({row.pcs_per_pack}/pack){over ? " ⚠️ melebihi stok" : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <button onClick={handleSubmit} disabled={busy || totalPackForm === 0}
              className="w-full py-3 text-sm rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-40">
              {busy ? "Menyimpan..." : `Simpan Penjualan${totalPackForm > 0 ? ` (${totalPackForm} pack)` : ""}`}
            </button>
          </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: LAPORAN PENJUALAN ══════════ */}
      {activeTab === "laporan" && (
        <div className="space-y-3">
          <RiwayatFilter
            preset={preset} onPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            selectedBulan={selectedBulan} onBulan={setSelectedBulan}
            accentColor="red"
          />

          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 border-b bg-red-50 border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store size={15} className="text-red-500" />
                <span className="font-bold text-sm text-red-800">{TOKO}</span>
              </div>
              <span className="text-xs text-gray-400">{periodLabel()}</span>
            </div>

            {BRAND_CONFIG.map(bc => {
              const isAmber = bc.color === "amber";
              const rows = bc.variants.map(v => {
                const row = rowFor(bc.brand, v);
                const pack = row ? salesPackForReject(row.id) : 0;
                const pcs  = row ? salesPcsForReject(row.id) : 0;
                return { label: v, pack, pcs };
              });
              const subPack = rows.reduce((s, r) => s + r.pack, 0);
              const subPcs  = rows.reduce((s, r) => s + r.pcs, 0);
              return (
                <div key={bc.brand} className="px-4 py-2 border-b border-gray-50 last:border-0">
                  <p className={`text-xs font-semibold uppercase tracking-wide mt-1 mb-1 ${isAmber ? "text-amber-600" : "text-blue-600"}`}>{bc.label}</p>
                  {rows.map(r => (
                    <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{r.label}</span>
                      <div className="text-right">
                        {r.pack > 0
                          ? <><span className="font-semibold text-sm text-gray-800">{formatAngka(r.pack)} pack</span><span className="text-xs text-gray-400 ml-1.5">({formatAngka(r.pcs)} pcs)</span></>
                          : <span className="text-sm text-gray-300">—</span>}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-1.5">
                    <span className={`text-xs font-bold ${isAmber ? "text-amber-700" : "text-blue-700"}`}>Subtotal {bc.label}</span>
                    <div className="text-right">
                      <span className={`font-bold text-sm ${isAmber ? "text-amber-700" : "text-blue-700"}`}>{formatAngka(subPack)} pack</span>
                      <span className="text-xs text-gray-500 ml-1.5">({formatAngka(subPcs)} pcs)</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {(() => {
              const gPack = allSales.reduce((s, p) => s + p.jumlah_pack, 0);
              const gPcs  = allSales.reduce((s, p) => s + p.jumlah_pcs, 0);
              return (
                <div className="flex items-center justify-between px-4 py-3 border-t border-red-100 bg-red-50">
                  <span className="font-bold text-sm text-red-700">Total {TOKO}</span>
                  <div className="text-right">
                    <span className="font-bold text-sm text-red-700">{formatAngka(gPack)} pack</span>
                    <span className="text-xs text-gray-500 ml-1.5">({formatAngka(gPcs)} pcs)</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {showResetModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <RotateCcw size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">Reset Penjualan Reject?</p>
                <p className="text-xs text-gray-500 mt-0.5">Semua penjualan reject ke {TOKO} dihapus & stok pcs dikembalikan.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowResetModal(false)} disabled={resetBusy}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Batal
              </button>
              <button type="button" onClick={doReset} disabled={resetBusy}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-60">
                {resetBusy ? "Memproses..." : "Ya, Reset"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showUndoModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                <RotateCcw size={18} className="text-orange-500" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">Undo Penjualan Hari Ini?</p>
                <p className="text-xs text-gray-500 mt-0.5">Hanya penjualan reject hari ini ({todayStr}) yang dibatalkan & stok dikembalikan. Data hari sebelumnya aman.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowUndoModal(false)} disabled={undoBusy}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Batal
              </button>
              <button type="button" onClick={doUndoToday} disabled={undoBusy}
                className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60">
                {undoBusy ? "Memproses..." : "Ya, Undo"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Kalender Indonesia (mulai Senin) ──────────────────────────
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const NAMA_BULAN  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

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
                isSelected(day) ? "bg-red-500 text-white shadow-sm" :
                isToday(day) ? "bg-red-100 text-red-700" : "hover:bg-white hover:shadow-sm text-gray-700"
              }`}>{day}</button>
          )
        )}
      </div>
    </div>
  );
}
