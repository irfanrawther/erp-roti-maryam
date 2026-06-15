"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { formatAngka } from "@/lib/utils";
import { Truck, RotateCcw } from "lucide-react";
import { RiwayatFilter, getRiwayatRange, ID_MONTHS } from "@/components/RiwayatFilter";
import type { RiwayatPreset } from "@/components/RiwayatFilter";

interface ProdukSku {
  id: string; brand: string; varian: string; isi_per_pack: number; stok_saat_ini: number;
}
interface PengirimanRow {
  id: string; produk_sku_id: string; jumlah_pack: number; tanggal_keluar: string;
}

const BRAND_CONFIG = [
  { brand: "cane",   label: "Cane RawtheR",     color: "amber" as const, variants: ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"] },
  { brand: "mehana", label: "Mehana Boga Utama", color: "blue"  as const, variants: ["Original", "Cokelat", "Keju"] },
] as const;

const BUTTER_GR_PER_PACK = 10; // 10gr per pack Whole Wheat atau per unit manual

export default function PengirimanPage() {
  const user     = getUserSession();
  const router   = useRouter();
  const caps     = getCapabilities(user);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  // Route guard — hanya yang punya akses Pengiriman
  useEffect(() => {
    if (user && !caps.pengiriman) router.replace(homeRoute(user));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState<"pengiriman" | "laporan">("pengiriman");
  const [skuList,   setSkuList]   = useState<ProdukSku[]>([]);
  const [allRows,   setAllRows]   = useState<PengirimanRow[]>([]);
  const [busy,      setBusy]      = useState(false);
  const [toast,     setToast]     = useState("");

  // Butter Hollmann bahan_baku id
  const [butterId, setButterId] = useState<string | null>(null);
  const [butterStok, setButterStok] = useState<number>(0);

  // Form state
  const [packForm,      setPackForm]      = useState<Record<string, string>>({});
  const [butterManual,  setButterManual]  = useState("");
  const [tanggal,       setTanggal]       = useState(todayStr);
  const [keterangan,    setKeterangan]    = useState("");

  // Filter state (Laporan tab)
  const [preset,        setPreset]        = useState<RiwayatPreset>("hari_ini");
  const [customStart,   setCustomStart]   = useState("");
  const [customEnd,     setCustomEnd]     = useState("");
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    fetchSkus();
    fetchButter();
    const ch = supabase.channel("pengiriman-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pengiriman" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "produk_sku" }, fetchSkus)
      .on("postgres_changes", { event: "*", schema: "public", table: "bahan_baku" }, fetchButter)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [preset, customStart, customEnd, selectedBulan]); // eslint-disable-line

  async function fetchSkus() {
    const { data } = await supabase.from("produk_sku").select("id, brand, varian, isi_per_pack, stok_saat_ini").eq("aktif", true).order("brand").order("varian");
    if (data) setSkuList(data as ProdukSku[]);
  }

  async function fetchButter() {
    const { data } = await supabase.from("bahan_baku").select("id, stok_saat_ini").eq("nama", "Butter Hollmann").single();
    if (data) { const d = data as { id: string; stok_saat_ini: number }; setButterId(d.id); setButterStok(d.stok_saat_ini); }
  }

  async function fetchAll() {
    const { start, end } = getRiwayatRange(preset, customStart, customEnd, selectedBulan);
    const { data } = await supabase.from("pengiriman").select("id, produk_sku_id, jumlah_pack, tanggal_keluar").gte("tanggal_keluar", start).lte("tanggal_keluar", end);
    if (data) setAllRows(data as PengirimanRow[]);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 4000); }

  // Derived: stok WW dan Butter calculation preview
  const wwSku      = skuList.find(s => s.brand === "cane" && s.varian === "Whole Wheat");
  const wwPack     = parseInt(packForm[wwSku?.id ?? ""] || "0") || 0;
  const manualUnit = parseInt(butterManual || "0") || 0;
  const totalButterGr = (wwPack + manualUnit) * BUTTER_GR_PER_PACK;
  const totalButterKg = totalButterGr / 1000;

  async function handleSubmit() {
    if (!user) return;
    const entries = Object.entries(packForm).filter(([, v]) => parseInt(v) > 0);
    if (!entries.length && manualUnit === 0) return;

    // Validate produk stok
    for (const [skuId, val] of entries) {
      const sku = skuList.find(s => s.id === skuId);
      if (sku && parseInt(val) > sku.stok_saat_ini) {
        showToast(`❌ Stok tidak cukup: ${sku.varian} (tersedia ${sku.stok_saat_ini} pack)`);
        return;
      }
    }

    // Warning (non-blocking) jika Butter Hollmann tidak cukup
    if (totalButterKg > 0 && totalButterKg > butterStok) {
      showToast(`⚠️ Stok Butter Hollmann tidak cukup (butuh ${totalButterGr}gr, tersedia ${(butterStok * 1000).toFixed(0)}gr) — tetap disimpan`);
    }

    setBusy(true);
    let err = false;

    // 1. Simpan pengiriman per SKU
    for (const [skuId, val] of entries) {
      const { error } = await supabase.from("pengiriman").insert({
        produk_sku_id: skuId, jumlah_pack: parseInt(val),
        tanggal_keluar: tanggal, keterangan: keterangan || null, created_by: user.id,
      });
      if (error) err = true;
    }

    // 2. Potong Butter Hollmann dari Whole Wheat (auto)
    if (wwPack > 0 && butterId) {
      const jumlahKg = (wwPack * BUTTER_GR_PER_PACK) / 1000;
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: butterId,
        jumlah: jumlahKg,
        satuan: "Kg",
        tipe: "keluar",
        tanggal,
        keterangan: `Pengiriman - Cane RawtheR Whole Wheat ${wwPack} pack`,
        created_by: user.id,
      });
    }

    // 3. Potong Butter Hollmann dari input manual
    if (manualUnit > 0 && butterId) {
      const jumlahKg = (manualUnit * BUTTER_GR_PER_PACK) / 1000;
      await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: butterId,
        jumlah: jumlahKg,
        satuan: "Kg",
        tipe: "keluar",
        tanggal,
        keterangan: `Pengiriman - Butter Hollmann Manual ${manualUnit}`,
        created_by: user.id,
      });
    }

    setBusy(false);
    if (!err) {
      setPackForm({}); setKeterangan(""); setButterManual("");
      const totalPack = entries.reduce((s, [, v]) => s + parseInt(v), 0);
      showToast(`✓ Pengiriman dicatat (${totalPack} pack)${totalButterKg > 0 ? ` · Butter Hollmann -${totalButterGr}gr` : ""}`);
      fetchSkus(); fetchButter(); fetchAll();
    } else {
      showToast("❌ Ada error, coba lagi");
    }
  }

  const totalPackForm = Object.values(packForm).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const sumForSku = (id: string) => allRows.filter(p => p.produk_sku_id === id).reduce((s, p) => s + p.jumlah_pack, 0);

  function handleReset() {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const y = new Date().getFullYear();
    const m = String(new Date().getMonth() + 1).padStart(2, "0");

    setActiveTab("pengiriman");
    setPackForm({});
    setButterManual("");
    setTanggal(today);
    setKeterangan("");
    setPreset("hari_ini");
    setCustomStart("");
    setCustomEnd("");
    setSelectedBulan(`${y}-${m}`);

    setAllRows([]);
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
    { key: "pengiriman", label: "Pengiriman" },
    { key: "laporan",    label: "Laporan Penjualan" },
  ] as const;

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-xs">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Pengiriman</h1>
        <button type="button" onClick={() => handleReset()}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors cursor-pointer">
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === t.key ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: PENGIRIMAN ══════════ */}
      {activeTab === "pengiriman" && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <Truck size={15} className="text-green-500" /> Catat Pengiriman
            </h2>

            {/* Tanggal & Keterangan */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tanggal *</label>
                <input type="date" className="input" value={tanggal} onChange={e => setTanggal(e.target.value)} />
              </div>
              <div>
                <label className="label">Keterangan</label>
                <input type="text" className="input" placeholder="Customer, tujuan..." value={keterangan} onChange={e => setKeterangan(e.target.value)} />
              </div>
            </div>

            {/* Brand cards — side by side */}
            <div className="grid grid-cols-2 gap-3">
              {BRAND_CONFIG.map(bc => {
                const brandSkus     = skuList.filter(s => s.brand === bc.brand);
                const isAmber       = bc.color === "amber";
                const mehanaIsiList = bc.brand === "mehana"
                  ? [5, 10].filter(isi => brandSkus.some(s => s.isi_per_pack === isi))
                  : [];

                return (
                  <div key={bc.brand} className={`rounded-xl border p-3 space-y-2 ${isAmber ? "border-amber-100 bg-amber-50/40" : "border-blue-100 bg-blue-50/40"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isAmber ? "text-amber-600" : "text-blue-600"}`}>{bc.label}</p>

                    {bc.brand === "cane" ? (
                      <>
                        {bc.variants.map(v => {
                          const sku = brandSkus.find(s => s.varian === v);
                          if (!sku) return null;
                          return (
                            <div key={v} className="space-y-0.5">
                              <span className="text-xs text-gray-700 font-medium">{v}</span>
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" max={sku.stok_saat_ini} placeholder=""
                                  className="input flex-1 text-right text-sm py-1"
                                  value={packForm[sku.id] ?? ""}
                                  onChange={e => setPackForm(f => ({ ...f, [sku.id]: e.target.value }))} />
                                <span className="text-xs text-gray-400 shrink-0">pack</span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Butter Hollmann manual — di bawah Whole Wheat */}
                        <div className="border-t border-amber-100 pt-2 mt-1 space-y-0.5">
                          <span className="text-xs text-gray-700 font-medium">Butter Hollmann</span>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" placeholder=""
                              className="input flex-1 text-right text-sm py-1"
                              value={butterManual}
                              onChange={e => setButterManual(e.target.value)} />
                            <span className="text-xs text-gray-400 shrink-0">pack</span>
                          </div>
                          <p className="text-[10px] text-gray-400">= {(parseInt(butterManual || "0") || 0) * BUTTER_GR_PER_PACK}gr Butter Hollmann</p>
                        </div>

                        {/* Preview total Butter */}
                        {totalButterKg > 0 && (
                          <div className={`rounded-lg px-2.5 py-1.5 text-xs ${totalButterKg > butterStok ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                            Total Butter Hollmann: <strong>{totalButterGr}gr</strong>
                            {totalButterKg > butterStok && " ⚠️ melebihi stok"}
                          </div>
                        )}
                      </>
                    ) : (
                      mehanaIsiList.map((isi, gi) => (
                        <div key={isi}>
                          {gi > 0 && <div className="border-t border-gray-200 my-1" />}
                          <p className="text-[10px] font-semibold text-gray-400 mb-1">Isi {isi} Pcs</p>
                          {bc.variants.map(v => {
                            const sku = brandSkus.find(s => s.varian === v && s.isi_per_pack === isi);
                            if (!sku) return null;
                            return (
                              <div key={`${v}-${isi}`} className="space-y-0.5 mb-1.5">
                                <span className="text-xs text-gray-700 font-medium">{v}</span>
                                <div className="flex items-center gap-1">
                                  <input type="number" min="0" max={sku.stok_saat_ini} placeholder=""
                                    className="input flex-1 text-right text-sm py-1"
                                    value={packForm[sku.id] ?? ""}
                                    onChange={e => setPackForm(f => ({ ...f, [sku.id]: e.target.value }))} />
                                  <span className="text-xs text-gray-400 shrink-0">pack</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={handleSubmit} disabled={busy || (totalPackForm === 0 && manualUnit === 0)}
              className="btn-primary w-full py-3 text-sm disabled:opacity-40">
              {busy ? "Menyimpan..." : `Simpan Pengiriman${totalPackForm > 0 ? ` (${totalPackForm} pack)` : ""}`}
            </button>
          </div>
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
            accentColor="green"
          />

          {BRAND_CONFIG.map(bc => {
            const brandSkus = skuList.filter(s => s.brand === bc.brand);
            const isAmber   = bc.color === "amber";

            type R = { label: string; pack: number; pcs: number };
            const renderRow = (r: R) => (
              <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700">{r.label}</span>
                <div className="text-right">
                  {r.pack > 0
                    ? <><span className="font-semibold text-sm text-gray-800">{formatAngka(r.pack)} pack</span><span className="text-xs text-gray-400 ml-1.5">({formatAngka(r.pcs)} pcs)</span></>
                    : <span className="text-sm text-gray-300">—</span>}
                </div>
              </div>
            );

            const caneRows: R[] = bc.brand === "cane" ? bc.variants.map(v => {
              const sku = brandSkus.find(s => s.varian === v);
              const pack = sku ? sumForSku(sku.id) : 0;
              return { label: v, pack, pcs: sku ? pack * sku.isi_per_pack : 0 };
            }) : [];

            const mIsi5:  R[] = bc.brand === "mehana" ? bc.variants.map(v => { const sku = brandSkus.find(s => s.varian === v && s.isi_per_pack === 5);  const pack = sku ? sumForSku(sku.id) : 0; return { label: v, pack, pcs: pack * 5  }; }) : [];
            const mIsi10: R[] = bc.brand === "mehana" ? bc.variants.map(v => { const sku = brandSkus.find(s => s.varian === v && s.isi_per_pack === 10); const pack = sku ? sumForSku(sku.id) : 0; return { label: v, pack, pcs: pack * 10 }; }) : [];

            const totalPack = allRows.filter(p => brandSkus.some(s => s.id === p.produk_sku_id)).reduce((s, p) => s + p.jumlah_pack, 0);
            const totalPcs  = allRows.filter(p => brandSkus.some(s => s.id === p.produk_sku_id)).reduce((s, p) => { const sku = brandSkus.find(sk => sk.id === p.produk_sku_id); return s + p.jumlah_pack * (sku?.isi_per_pack ?? 0); }, 0);

            return (
              <div key={bc.brand} className="card overflow-hidden p-0">
                <div className={`px-4 py-3 border-b ${isAmber ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck size={15} className={isAmber ? "text-amber-500" : "text-blue-500"} />
                      <span className={`font-bold text-sm ${isAmber ? "text-amber-800" : "text-blue-800"}`}>{bc.label}</span>
                    </div>
                    <span className="text-xs text-gray-400">{periodLabel()}</span>
                  </div>
                </div>
                <div className="px-4 py-2">
                  {bc.brand === "cane" ? caneRows.map(renderRow) : (
                    <>
                      <p className="text-xs font-semibold text-gray-400 mt-1 mb-1">Isi 5 Pcs</p>
                      {mIsi5.map(renderRow)}
                      <div className="border-t border-gray-100 my-2" />
                      <p className="text-xs font-semibold text-gray-400 mb-1">Isi 10 Pcs</p>
                      {mIsi10.map(renderRow)}
                    </>
                  )}
                </div>
                <div className={`flex items-center justify-between px-4 py-3 border-t ${isAmber ? "border-amber-100 bg-amber-50" : "border-blue-100 bg-blue-50"}`}>
                  <span className={`font-bold text-sm ${isAmber ? "text-amber-700" : "text-blue-700"}`}>Total</span>
                  <div className="text-right">
                    <span className={`font-bold text-sm ${isAmber ? "text-amber-700" : "text-blue-700"}`}>{formatAngka(totalPack)} pack</span>
                    <span className="text-xs text-gray-500 ml-1.5">({formatAngka(totalPcs)} pcs)</span>
                  </div>
                </div>
              </div>
            );
          })}

          {(() => {
            const gPack = allRows.reduce((s, p) => s + p.jumlah_pack, 0);
            const gPcs  = allRows.reduce((s, p) => { const sku = skuList.find(sk => sk.id === p.produk_sku_id); return s + p.jumlah_pack * (sku?.isi_per_pack ?? 0); }, 0);
            return (
              <div className="card flex items-center justify-between py-3">
                <span className="font-bold text-gray-700 text-sm">Grand Total</span>
                <div>
                  <span className="font-bold text-gray-800">{formatAngka(gPack)} pack</span>
                  <span className="text-xs text-gray-500 ml-1.5">({formatAngka(gPcs)} pcs)</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
