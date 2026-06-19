"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggalWaktu, formatTanggal } from "@/lib/utils";
import { Plus, Minus, X, History, Check, FlaskConical, SlidersHorizontal, Trash2, AlertCircle, CheckCircle2, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { RiwayatFilter, getRiwayatRange, type RiwayatPreset } from "@/components/RiwayatFilter";

// ── Types ─────────────────────────────────────────────────────
interface BahanBaku {
  id: string; nama: string; satuan: string;
  stok_saat_ini: number; stok_minimum: number;
}
interface Riwayat {
  id: string; tipe: "masuk" | "keluar"; jumlah: number; satuan: string;
  tanggal: string; created_at: string; keterangan: string | null;
  bahan_baku_id: string;
  bahan_baku: { nama: string }; users: { nama: string };
}

// Entri otomatis dari produksi (bukan penyesuaian stok manual).
// Dipakai untuk memisahkan tab "Riwayat Penerimaan/Pengurangan" (manual)
// dari "Riwayat Pemakaian". NULL keterangan = entri manual.
function isProduksiEntry(keterangan: string | null): boolean {
  if (!keterangan) return false;
  return (
    keterangan.startsWith("Produksi batch") ||
    keterangan.startsWith("Restore") ||
    keterangan.startsWith("proses_bikin::")
  );
}
interface RiwayatPemakaian {
  id: string; jumlah_digunakan: number; satuan: string; created_at: string;
  bahan_baku: { nama: string };
  batch_produksi: { tanggal_produksi: string; produk_sku: { nama_brand: string; varian: string }; };
  users: { nama: string };
}
interface ProsesBikinRow {
  id: string; jumlah: number; satuan: string; keterangan: string; created_at: string;
  bahan_baku: { nama: string };
  users: { nama: string };
}
interface AdjustmentEntry {
  id: string;
  tipe: "sisa" | "over";
  jumlah_adjustment: number;
  satuan: string;
  catatan: string | null;
  jumlah_sebelum: number;
  riwayat_id: string | null;
  created_at: string;
  bahan_baku: { nama: string };
  users: { nama: string };
}

// Unified entry untuk Riwayat Pemakaian (dari kedua sumber)
interface PemakaianEntry {
  id: string;
  sumber: "produksi" | "proses_bikin";
  namaBahan: string;
  jumlah: number;
  satuan: string;
  created_at: string;
  label: string;       // e.g. "Cane Original" atau "Produksi Batch"
  tanggal?: string;
  namaUser: string;
}

// Label mapping untuk proses bikin brand+varian key
const PROSES_BIKIN_LABEL: Record<string, Record<string, string>> = {
  cane:   { original:"Cane Original", melted_choco:"Cane Melted Choco", grated_cheese:"Cane Grated Cheese", wholewheat:"Cane Whole Wheat" },
  mehana: { original:"Mehana Original", cokelat:"Mehana Cokelat", keju:"Mehana Keju" },
};

const SATUAN_OPTIONS = ["ml", "gr", "kg", "liter", "pcs"];
const URUTAN_BAHAN = [
  "Terigu","Minyak","Garam","Gula","Air",
  "Margarine Menara","Mesis Innova","Keju Calf",
  "Margarine Blue Band","Mesis Tulip","Keju Kraft Martabak",
  "Baking Powder","Telur","Tepung Gandum","Butter Hollmann",
];
function sortBahan<T extends { nama: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ia = URUTAN_BAHAN.indexOf(a.nama), ib = URUTAN_BAHAN.indexOf(b.nama);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}


type ActiveTab = "stok" | "riwayat" | "pemakaian" | "adjustment";

// Konversi satuan ke base unit (kg / liter / pcs) untuk perbandingan lintas satuan.
// gr→kg, ml→liter, selainnya tetap.
type BaseUnit = "kg" | "liter" | "pcs" | "unknown";
function toBase(value: number, satuan: string): { value: number; base: BaseUnit } {
  switch (satuan.toLowerCase()) {
    case "gr":    return { value: value / 1000, base: "kg" };
    case "kg":    return { value,               base: "kg" };
    case "ml":    return { value: value / 1000, base: "liter" };
    case "liter": return { value,               base: "liter" };
    case "pcs":   return { value,               base: "pcs" };
    default:      return { value,               base: "unknown" };
  }
}
// Apakah dua satuan kompatibel (bisa dibandingkan / dijumlahkan)?
function unitCompatible(a: string, b: string): boolean {
  return toBase(0, a).base === toBase(0, b).base;
}

// ── BahanBakuView ─────────────────────────────────────────────
// Konten penuh halaman Bahan Baku (sub-tabs + panel), tanpa wrapper
// halaman/judul — dipakai standalone di route /bahan-baku dan
// sebagai tab di dalam halaman Packing & Freezer.
export default function BahanBakuView() {
  const user = getUserSession();

  const [bahanList,        setBahanList]        = useState<BahanBaku[]>([]);
  const [riwayat,           setRiwayat]           = useState<Riwayat[]>([]);
  const [riwayatPemakaian,  setRiwayatPemakaian]  = useState<RiwayatPemakaian[]>([]);
  const [riwayatProsesBikin,setRiwayatProsesBikin] = useState<ProsesBikinRow[]>([]);
  const [activeTab,        setActiveTab]        = useState<ActiveTab>("stok");
  const [filterPemakaianBahan, setFilterPemakaianBahan] = useState("");

  // Riwayat tab — filter state (pakai RiwayatFilter dengan Pilih Bulan)
  const [rPreset,       setRPreset]       = useState<RiwayatPreset>("hari_ini");
  const [rCustomStart,  setRCustomStart]  = useState("");
  const [rCustomEnd,    setRCustomEnd]    = useState("");
  const [rSelectedBulan, setRSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rBahanId, setRBahanId] = useState(""); // "" = semua bahan

  // Adjustment tab state
  const [adjustments,  setAdjustments]  = useState<AdjustmentEntry[]>([]);
  const [adjBahanId,   setAdjBahanId]   = useState("");
  const [adjTipe,      setAdjTipe]      = useState<"sisa" | "over">("sisa");
  const [adjJumlah,    setAdjJumlah]    = useState("");
  const [adjSatuan,    setAdjSatuan]    = useState("");
  const [adjCatatan,   setAdjCatatan]   = useState("");
  const [adjLoading,   setAdjLoading]   = useState(false);
  const [adjError,     setAdjError]     = useState("");
  const [adjSuccess,   setAdjSuccess]   = useState("");

  // Date filter state — shared by pemakaian & adjustment tabs
  const [preset,        setPreset]        = useState<RiwayatPreset>("hari_ini");
  const [customStart,   setCustomStart]   = useState("");
  const [customEnd,     setCustomEnd]     = useState("");
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // ── Fetch ────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const ch = supabase.channel("bahan-baku-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"penerimaan_bahan_baku" }, fetchData)
      .on("postgres_changes", { event:"*", schema:"public", table:"bahan_baku" }, fetchData)
      .on("postgres_changes", { event:"*", schema:"public", table:"penggunaan_bahan" }, fetchData)
      .on("postgres_changes", { event:"*", schema:"public", table:"adjustment_bahan_baku" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchData() {
    const [bahanRes, riwayatRes, pemakaianRes, prosesBikinRes, adjRes] = await Promise.all([
      supabase.from("bahan_baku").select("id,nama,satuan,stok_saat_ini,stok_minimum").eq("aktif", true),
      // Riwayat Penerimaan/Pengurangan: ambil semua, lalu exclude entri
      // produksi di sisi client (NULL-safe — filter .not(..like..) di PostgREST
      // membuang baris keterangan NULL, yaitu entri manual).
      supabase.from("penerimaan_bahan_baku")
        .select("id,tipe,jumlah,satuan,tanggal,created_at,keterangan,bahan_baku_id,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(500),
      // Riwayat Pemakaian sumber 1: Produksi Adonan (penggunaan_bahan)
      supabase.from("penggunaan_bahan")
        .select(`id,jumlah_digunakan,satuan,created_at,
          bahan_baku:bahan_baku_id(nama),
          batch_produksi:batch_produksi_id(tanggal_produksi,produk_sku:produk_sku_id(nama_brand,varian)),
          users:created_by(nama)`)
        .order("created_at", { ascending: false }).limit(500),
      // Riwayat Pemakaian sumber 2: Proses Bikin (penerimaan_bahan_baku tipe keluar proses_bikin)
      supabase.from("penerimaan_bahan_baku")
        .select("id,jumlah,satuan,keterangan,created_at,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
        .like("keterangan","proses_bikin::%")
        .order("created_at", { ascending: false }).limit(500),
      // Adjustment history
      supabase.from("adjustment_bahan_baku")
        .select("id,tipe,jumlah_adjustment,satuan,catatan,jumlah_sebelum,riwayat_id,created_at,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(300),
    ]);
    if (bahanRes.data)       setBahanList(sortBahan(bahanRes.data));
    if (riwayatRes.data)     setRiwayat(riwayatRes.data as unknown as Riwayat[]);
    if (pemakaianRes.data)   setRiwayatPemakaian(pemakaianRes.data as unknown as RiwayatPemakaian[]);
    if (prosesBikinRes.data) setRiwayatProsesBikin(prosesBikinRes.data as unknown as ProsesBikinRow[]);
    if (adjRes.data)         setAdjustments(adjRes.data as unknown as AdjustmentEntry[]);
  }

  async function submitTransaksi(bahanId: string, tipe: "masuk" | "keluar", jumlah: number, satuan: string): Promise<boolean> {
    if (!user) return false;
    const { error } = await supabase.from("penerimaan_bahan_baku").insert({
      bahan_baku_id: bahanId, jumlah, satuan, tipe,
      tanggal: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), created_by: user.id,
      keterangan: tipe === "masuk" ? "Tambah stok manual" : "Kurang stok manual",
    });
    if (!error) fetchData();
    return !error;
  }

  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !adjBahanId || !adjJumlah || !adjSatuan) return;
    setAdjLoading(true);
    setAdjError("");

    const adj = parseFloat(adjJumlah);
    if (adj <= 0) {
      setAdjError("Jumlah harus lebih dari 0");
      setAdjLoading(false);
      return;
    }

    // Cari entri proses_bikin terakhir untuk bahan ini
    const { data: lastEntry } = await supabase
      .from("penerimaan_bahan_baku")
      .select("id, jumlah, satuan, keterangan")
      .eq("bahan_baku_id", adjBahanId)
      .like("keterangan", "proses_bikin::%")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastEntry) {
      setAdjError("Tidak ada riwayat pemakaian (Rendam) untuk bahan ini.");
      setAdjLoading(false);
      return;
    }

    // Konversi adj ke satuan yang sama dengan lastEntry (mis. gr→kg)
    if (!unitCompatible(adjSatuan, lastEntry.satuan)) {
      setAdjError(`Satuan tidak kompatibel: ${adjSatuan} vs ${lastEntry.satuan} (bahan ini tercatat dalam ${lastEntry.satuan}).`);
      setAdjLoading(false);
      return;
    }
    const adjInBase  = toBase(adj, adjSatuan).value;
    const lastInBase = toBase(lastEntry.jumlah, lastEntry.satuan).value;

    const newBase = adjTipe === "sisa" ? lastInBase - adjInBase : lastInBase + adjInBase;
    if (newBase <= 0) {
      setAdjError(`Adjustment melebihi jumlah pemakaian terakhir (${lastEntry.jumlah} ${lastEntry.satuan} = ${lastInBase.toFixed(4)} base unit).`);
      setAdjLoading(false);
      return;
    }

    // Simpan kembali dalam satuan asli lastEntry
    const baseToLastUnit = (v: number) => {
      const s = lastEntry.satuan.toLowerCase();
      if (s === "gr") return v * 1000;
      if (s === "ml") return v * 1000;
      return v;
    };
    const newJumlah = baseToLastUnit(newBase);

    // Edit baris pemakaian (UPDATE trigger sinkronisasi stok)
    const adjNote = ` | ${adjTipe === "sisa" ? "Sisa" : "Over"} ${adj}${adjSatuan} - Adj: ${user.nama}`;
    const { error: updateErr } = await supabase
      .from("penerimaan_bahan_baku")
      .update({ jumlah: newJumlah, keterangan: lastEntry.keterangan + adjNote })
      .eq("id", lastEntry.id);

    if (updateErr) {
      setAdjError("Gagal update riwayat: " + updateErr.message);
      setAdjLoading(false);
      return;
    }

    // Catat di tabel adjustment
    await supabase.from("adjustment_bahan_baku").insert({
      bahan_baku_id: adjBahanId,
      tipe: adjTipe,
      jumlah_adjustment: adj,
      satuan: adjSatuan,
      catatan: adjCatatan || null,
      jumlah_sebelum: lastEntry.jumlah,
      riwayat_id: lastEntry.id,
      created_by: user.id,
    });

    setAdjJumlah(""); setAdjCatatan(""); setAdjSatuan("");
    setAdjSuccess("Adjustment disimpan! Stok dan riwayat pemakaian diperbarui.");
    setTimeout(() => setAdjSuccess(""), 4000);
    setAdjLoading(false);
    fetchData();
  }

  async function handleDeleteAdjustment(adj: AdjustmentEntry) {
    if (!adj.riwayat_id) {
      await supabase.from("adjustment_bahan_baku").delete().eq("id", adj.id);
      fetchData();
      return;
    }
    // Restore jumlah asli sebelum adjustment (UPDATE trigger sinkronisasi stok)
    await supabase
      .from("penerimaan_bahan_baku")
      .update({ jumlah: adj.jumlah_sebelum })
      .eq("id", adj.riwayat_id);
    await supabase.from("adjustment_bahan_baku").delete().eq("id", adj.id);
    fetchData();
  }

  // ── Derived filtered lists ──────────────────────────────────
  // Date-only comparison via WIB timezone (used by all 3 filter tabs)
  function toWIBDate(utcStr: string): string {
    return new Date(utcStr).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  }

  // Riwayat tab
  const rRange = getRiwayatRange(rPreset, rCustomStart, rCustomEnd, rSelectedBulan);
  const riwayatFiltered = riwayat.filter((r) => {
    if (isProduksiEntry(r.keterangan)) return false;
    const d = toWIBDate(r.created_at);
    if (d < rRange.start || d > rRange.end) return false;
    if (rBahanId && r.bahan_baku_id !== rBahanId) return false;
    return true;
  });

  // Pemakaian & Adjustment tabs
  const paRange = getRiwayatRange(preset, customStart, customEnd, selectedBulan);

  // ── Merge Produksi Adonan + Proses Bikin → unified PemakaianEntry ──
  const allPemakaian: PemakaianEntry[] = [
    // Sumber 1: Produksi Adonan (penggunaan_bahan)
    ...riwayatPemakaian.map((r): PemakaianEntry => {
      const sku    = r.batch_produksi?.produk_sku as { nama_brand: string; varian: string } | null;
      const brand  = sku?.nama_brand ?? "";
      const varian = sku?.varian ?? "";
      return {
        id:         `prod-${r.id}`,
        sumber:     "produksi",
        namaBahan:  r.bahan_baku?.nama ?? "?",
        jumlah:     r.jumlah_digunakan,
        satuan:     r.satuan,
        created_at: r.created_at,
        label:      [brand, varian].filter(Boolean).join(" ") || "Produksi Adonan",
        tanggal:    r.batch_produksi?.tanggal_produksi,
        namaUser:   r.users?.nama ?? "",
      };
    }),
    // Sumber 2: Proses Bikin (penerimaan_bahan_baku proses_bikin::)
    ...riwayatProsesBikin.map((r): PemakaianEntry => {
      let label = "Proses Bikin";
      try {
        const jsonStr = r.keterangan.replace("proses_bikin::", "").split(" | ")[0];
        const json = JSON.parse(jsonStr);
        const brandLabels = PROSES_BIKIN_LABEL[json.brandKey] ?? {};
        label = brandLabels[json.varianKey] ?? `Proses Bikin ${json.varianKey ?? ""}`;
      } catch {}
      return {
        id:         `pb-${r.id}`,
        sumber:     "proses_bikin",
        namaBahan:  r.bahan_baku?.nama ?? "?",
        jumlah:     r.jumlah,
        satuan:     r.satuan,
        created_at: r.created_at,
        label,
        namaUser:   r.users?.nama ?? "",
      };
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)); // terbaru di atas

  const pemakaianFiltered = allPemakaian.filter((r) => {
    const d = toWIBDate(r.created_at);
    if (d < paRange.start || d > paRange.end) return false;
    if (filterPemakaianBahan && !r.namaBahan.toLowerCase().includes(filterPemakaianBahan.toLowerCase())) return false;
    return true;
  });

  const adjustmentFiltered = adjustments.filter((r) => {
    const d = toWIBDate(r.created_at);
    return d >= paRange.start && d <= paRange.end;
  });

  function handleReset() {
    // Pemakaian & Adjustment filter
    setPreset("hari_ini");
    setCustomStart(""); setCustomEnd("");
    const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
    setSelectedBulan(thisMonth);
    // Riwayat filter
    setRPreset("hari_ini");
    setRCustomStart(""); setRCustomEnd("");
    setRSelectedBulan(thisMonth);
    setRBahanId("");
    // Pemakaian search
    setFilterPemakaianBahan("");
    // Adjustment form
    setAdjBahanId("");
    setAdjTipe("sisa");
    setAdjJumlah("");
    setAdjSatuan("");
    setAdjCatatan("");
    setAdjError("");
    setAdjSuccess("");
    // Kembali ke tab Stok & refresh data
    setActiveTab("stok");
    fetchData();
  }

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "stok",       label: "Stok Saat Ini" },
    { key: "riwayat",    label: "Riwayat" },
    { key: "pemakaian",  label: "Pemakaian" },
    { key: "adjustment", label: "Adjustment" },
  ];


  return (
    <div className="space-y-4">
      {/* Tabs + Reset button */}
      <div className="flex items-center gap-2">
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 flex-1">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.key ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={handleReset}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors shrink-0">
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* ── Tab: Stok ── */}
      {activeTab === "stok" && (
        <div className="card">
          <div className="space-y-2">
            {bahanList.map((b) => <BahanCard key={b.id} bahan={b} onSubmit={submitTransaksi} />)}
          </div>
        </div>
      )}

      {/* ── Tab: Riwayat Penerimaan/Pengurangan ── */}
      {activeTab === "riwayat" && (
        <div className="space-y-3">
          {/* Filter: date range (RiwayatFilter) + bahan dropdown */}
          <RiwayatFilter
            preset={rPreset} onPreset={setRPreset}
            customStart={rCustomStart} customEnd={rCustomEnd}
            onCustomStart={setRCustomStart} onCustomEnd={setRCustomEnd}
            selectedBulan={rSelectedBulan} onBulan={setRSelectedBulan}
          />
          <div className="card">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Bahan Baku:</label>
              <select className="input text-sm py-1.5 flex-1" value={rBahanId} onChange={(e) => setRBahanId(e.target.value)}>
                <option value="">Semua Bahan</option>
                {bahanList.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
              </select>
            </div>
          </div>

          {/* Summary card */}
          {riwayatFiltered.length > 0 && (() => {
            const byBahan: Record<string, { masuk: number; keluar: number; satuan: string }> = {};
            for (const r of riwayatFiltered) {
              const nm = r.bahan_baku?.nama ?? "?";
              if (!byBahan[nm]) byBahan[nm] = { masuk: 0, keluar: 0, satuan: r.satuan };
              if (r.tipe === "masuk") byBahan[nm].masuk += r.jumlah;
              else byBahan[nm].keluar += r.jumlah;
            }
            const sorted = Object.entries(byBahan).sort((a, b) => {
              const ia = URUTAN_BAHAN.indexOf(a[0]), ib = URUTAN_BAHAN.indexOf(b[0]);
              return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            return (
              <div className="bg-gray-900 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">
                  ═ Ringkasan Penerimaan & Pengurangan
                </p>
                {sorted.map(([nama, { masuk, keluar, satuan }]) => (
                  <div key={nama} className="space-y-0.5">
                    <p className="text-xs font-semibold text-gray-300">{nama}</p>
                    <div className="flex gap-4 pl-2">
                      {masuk > 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingUp size={10} className="text-green-400" />
                          <span className="text-xs text-green-400">{formatAngka(masuk)} {satuan}</span>
                        </div>
                      )}
                      {keluar > 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingDown size={10} className="text-red-400" />
                          <span className="text-xs text-red-400">{formatAngka(keluar)} {satuan}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Riwayat list */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Riwayat ({riwayatFiltered.length} data)
              </span>
            </div>
            <div className="space-y-2">
              {riwayatFiltered.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">Tidak ada data dalam rentang ini</p>
                : riwayatFiltered.map((r) => {
                    const masuk = r.tipe === "masuk";
                    return (
                      <div key={r.id} className="flex items-start justify-between border-b border-gray-50 pb-2.5">
                        <div>
                          <p className={`text-sm font-bold ${masuk ? "text-green-600" : "text-red-500"}`}>
                            {masuk ? "+" : "−"} {formatAngka(r.jumlah)} {r.satuan} — {r.bahan_baku?.nama}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTanggal(r.tanggal)} · Oleh: <span className="font-medium text-gray-600">{r.users?.nama ?? "—"}</span>
                          </p>
                          <p className="text-xs text-gray-300">{formatTanggalWaktu(r.created_at)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-3 ${masuk ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {masuk ? "Penerimaan" : "Pengurangan"}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Riwayat Pemakaian ── */}
      {activeTab === "pemakaian" && (
        <div className="space-y-3">
          <RiwayatFilter
            preset={preset} onPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            selectedBulan={selectedBulan} onBulan={setSelectedBulan}
          />
          {/* Grand Total panel — gabungan Produksi + Proses Bikin */}
          {pemakaianFiltered.length > 0 && (() => {
            const totals: Record<string, { jumlah: number; satuan: string }> = {};
            for (const r of pemakaianFiltered) {
              if (!totals[r.namaBahan]) totals[r.namaBahan] = { jumlah: 0, satuan: r.satuan };
              totals[r.namaBahan].jumlah += r.jumlah;
            }
            const prodCount = pemakaianFiltered.filter(r => r.sumber === "produksi").length;
            const pbCount   = pemakaianFiltered.filter(r => r.sumber === "proses_bikin").length;
            const sorted = Object.entries(totals).sort((a, b) => {
              const ia = URUTAN_BAHAN.indexOf(a[0]), ib = URUTAN_BAHAN.indexOf(b[0]);
              return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            return (
              <div className="bg-gray-900 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">═ Grand Total Pemakaian</p>
                  <div className="flex gap-2">
                    {prodCount > 0 && <span className="text-[10px] bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded-full">Produksi ×{prodCount}</span>}
                    {pbCount   > 0 && <span className="text-[10px] bg-blue-900  text-blue-300  px-1.5 py-0.5 rounded-full">Proses Bikin ×{pbCount}</span>}
                  </div>
                </div>
                {sorted.map(([nama, { jumlah, satuan }]) => (
                  <div key={nama} className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">{nama}</span>
                    <span className="text-xs font-bold text-white">{formatAngka(jumlah)} {satuan}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-gray-500 shrink-0">Cari bahan:</label>
              <input className="input text-sm py-1.5 flex-1" placeholder="Nama bahan..."
                value={filterPemakaianBahan} onChange={(e) => setFilterPemakaianBahan(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-gray-600">
                Riwayat Pemakaian ({pemakaianFiltered.length} data)
              </span>
            </div>
            <div className="space-y-2.5">
              {pemakaianFiltered.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">Tidak ada data dalam rentang ini</p>
                : pemakaianFiltered.map((r) => (
                    <div key={r.id} className="border-b border-gray-50 pb-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-red-500">
                          − {formatAngka(r.jumlah)} {r.satuan} — {r.namaBahan}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          r.sumber === "produksi"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {r.sumber === "produksi" ? "Produksi" : "Proses Bikin"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        dari <span className="font-medium">{r.label}</span>
                        {r.tanggal ? `, ${formatTanggal(r.tanggal)}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">Oleh: <span className="font-medium text-gray-500">{r.namaUser || "—"}</span> · {formatTanggalWaktu(r.created_at)}</p>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Adjustment ── */}
      {activeTab === "adjustment" && (
        <div className="space-y-3">
          <RiwayatFilter
            preset={preset} onPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            selectedBulan={selectedBulan} onBulan={setSelectedBulan}
          />

          {/* Form input adjustment */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal size={15} className="text-amber-500" />
              <span className="font-semibold text-gray-700 text-sm">Input Adjustment</span>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-3">
              {/* Pilih Bahan */}
              <div>
                <label className="label">Pilih Bahan Baku</label>
                <select required className="input" value={adjBahanId} onChange={(e) => { setAdjBahanId(e.target.value); setAdjSatuan(""); }}>
                  <option value="">-- Pilih bahan --</option>
                  {bahanList.map((b) => (
                    <option key={b.id} value={b.id}>{b.nama}</option>
                  ))}
                </select>
              </div>

              {/* Tipe Adjustment */}
              <div>
                <label className="label">Tipe Adjustment</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjTipe("sisa")}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      adjTipe === "sisa"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-green-300"
                    }`}
                  >
                    <span className="block text-lg mb-0.5">↑</span>
                    Sisa
                    <span className="block text-[10px] font-normal mt-0.5 opacity-70">Pakai lebih sedikit → stok naik</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjTipe("over")}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      adjTipe === "over"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-red-300"
                    }`}
                  >
                    <span className="block text-lg mb-0.5">↓</span>
                    Over
                    <span className="block text-[10px] font-normal mt-0.5 opacity-70">Pakai lebih banyak → stok turun</span>
                  </button>
                </div>
              </div>

              {/* Jumlah + Satuan */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Jumlah</label>
                  <input
                    type="number" step="0.01" min="0.01" required
                    className="input text-center"
                    placeholder="0"
                    value={adjJumlah}
                    onChange={(e) => setAdjJumlah(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Satuan</label>
                  <select required className="input" value={adjSatuan} onChange={(e) => setAdjSatuan(e.target.value)}>
                    <option value="">Pilih</option>
                    {SATUAN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Catatan */}
              <div>
                <label className="label">Catatan (opsional)</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="Mis: sisa rendam batch pagi..."
                  value={adjCatatan}
                  onChange={(e) => setAdjCatatan(e.target.value)}
                />
              </div>

              {/* Info box — tampilkan juga ekuivalen satuan base */}
              {adjBahanId && adjJumlah && adjSatuan && (() => {
                const adjVal = parseFloat(adjJumlah) || 0;
                const { value: adjBase, base } = toBase(adjVal, adjSatuan);
                const showEq = (adjSatuan.toLowerCase() === "gr" || adjSatuan.toLowerCase() === "ml") && adjVal > 0;
                const eqLabel = showEq ? ` (= ${adjBase.toFixed(4).replace(/\.?0+$/, "")} ${base})` : "";
                return (
                  <div className={`rounded-xl p-3 text-xs ${adjTipe === "sisa" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {adjTipe === "sisa"
                      ? `Sisa ${adjJumlah} ${adjSatuan}${eqLabel} → pemakaian berkurang, stok naik`
                      : `Over ${adjJumlah} ${adjSatuan}${eqLabel} → pemakaian bertambah, stok turun`}
                  </div>
                );
              })()}

              {adjError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-sm">
                  <AlertCircle size={15} className="shrink-0" />
                  {adjError}
                </div>
              )}
              {adjSuccess && (
                <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl p-3 text-sm">
                  <CheckCircle2 size={15} className="shrink-0" />
                  {adjSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={adjLoading || !adjBahanId || !adjJumlah || !adjSatuan}
                className="btn-primary w-full disabled:opacity-40"
              >
                {adjLoading ? "Menyimpan..." : "Simpan Adjustment"}
              </button>
            </form>
          </div>

          {/* Riwayat Adjustment */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Riwayat Adjustment ({adjustmentFiltered.length} data)
              </span>
            </div>
            <div className="space-y-2">
              {adjustmentFiltered.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">Belum ada adjustment dalam rentang ini</p>
                : adjustmentFiltered.map((a) => {
                    const isSisa = a.tipe === "sisa";
                    return (
                      <div key={a.id} className={`rounded-xl border p-3 ${isSisa ? "border-green-100 bg-green-50/40" : "border-red-100 bg-red-50/40"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSisa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                {isSisa ? "↑ Sisa" : "↓ Over"}
                              </span>
                              <span className="text-sm font-semibold text-gray-800">
                                {formatAngka(a.jumlah_adjustment)} {a.satuan}
                              </span>
                              <span className="text-sm text-gray-600">— {a.bahan_baku?.nama}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Sebelum: <span className="font-medium">{formatAngka(a.jumlah_sebelum)} {a.satuan}</span>
                              {" → "}
                              Sesudah: <span className="font-medium">
                                {formatAngka(isSisa ? a.jumlah_sebelum - a.jumlah_adjustment : a.jumlah_sebelum + a.jumlah_adjustment)} {a.satuan}
                              </span>
                            </p>
                            {a.catatan && <p className="text-xs text-gray-400 mt-0.5 italic">&ldquo;{a.catatan}&rdquo;</p>}
                            <p className="text-xs text-gray-400 mt-0.5">
                              Oleh: <span className="font-medium text-gray-500">{a.users?.nama ?? "—"}</span> · {formatTanggalWaktu(a.created_at)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdjustment(a)}
                            className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg shrink-0 transition-colors"
                            title="Hapus & kembalikan perubahan"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Stok awal referensi (nilai reset terakhir migration 020) ──
const STOK_AWAL: Record<string, number> = {
  "Terigu":              500,
  "Minyak":              500,
  "Garam":                25,
  "Gula":                 50,
  "Air":                 190,
  "Margarine Menara":    100,
  "Mesis Innova":        100,
  "Keju Calf":            32,
  "Margarine Blue Band":  50,
  "Mesis Tulip":          50,
  "Keju Kraft Martabak":  16,
  "Baking Powder":         1,
  "Telur":               225,
  "Tepung Gandum":         5,
  "Butter Hollmann":       1,
};

// ── BahanCard ────────────────────────────────────────────────
function BahanCard({ bahan, onSubmit }: {
  bahan: BahanBaku;
  onSubmit: (id: string, tipe: "masuk" | "keluar", jumlah: number, satuan: string) => Promise<boolean>;
}) {
  const kritis = bahan.stok_saat_ini <= bahan.stok_minimum;
  const [mode,    setMode]    = useState<"masuk" | "keluar" | null>(null);
  const [jumlah,  setJumlah]  = useState("");
  const [satuan,  setSatuan]  = useState("");
  const [loading, setLoading] = useState(false);

  function openForm(tipe: "masuk" | "keluar") { setMode(tipe); setJumlah(""); setSatuan(""); }
  function closeForm() { setMode(null); setJumlah(""); setSatuan(""); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jumlah || !satuan || !mode) return;
    setLoading(true);
    const ok = await onSubmit(bahan.id, mode, parseFloat(jumlah), satuan);
    setLoading(false);
    if (ok) closeForm();
  }

  const stokAwal    = STOK_AWAL[bahan.nama] ?? null;
  const pengurangan = stokAwal !== null ? stokAwal - bahan.stok_saat_ini : 0;
  const adaPengurangan = stokAwal !== null && pengurangan > 0.0005; // threshold supaya 0.000 tidak tampil

  return (
    <div className={`rounded-xl border p-3 transition-all ${kritis ? "bg-red-50 border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-semibold text-sm ${kritis ? "text-red-700" : "text-gray-800"}`}>{bahan.nama}</p>
          <p className="text-xs text-gray-400">Min: {formatAngka(bahan.stok_minimum)} {bahan.satuan}</p>
          {kritis && <p className="text-xs text-red-500 font-medium mt-0.5">⚠ Stok kritis!</p>}
        </div>
        <div className="text-right ml-3 shrink-0">
          {/* Stok real */}
          <p className={`font-bold text-xl leading-none ${kritis ? "text-red-600" : "text-gray-800"}`}>
            {formatAngka(bahan.stok_saat_ini)}
            <span className="text-sm font-normal text-gray-400 ml-1">{bahan.satuan}</span>
          </p>
          {/* Pengurangan — hanya tampil jika ada pemakaian */}
          {adaPengurangan && (
            <p className="text-xs mt-0.5 flex items-center justify-end gap-0.5">
              <span style={{ color: "#EF4444" }} className="font-bold text-sm">↓</span>
              <span style={{ color: "#EF4444" }} className="font-semibold">
                {formatAngka(pengurangan)} {bahan.satuan}
              </span>
            </p>
          )}
        </div>
      </div>

      {!mode && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => openForm("masuk")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
            <Plus size={12} /> Tambah
          </button>
          <button onClick={() => openForm("keluar")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
            <Minus size={12} /> Kurangi
          </button>
        </div>
      )}

      {mode && (
        <form onSubmit={handleSubmit} className="mt-2.5">
          <div className={`text-xs font-semibold mb-1.5 ${mode === "masuk" ? "text-green-700" : "text-red-600"}`}>
            {mode === "masuk" ? "+ Tambah stok" : "− Kurangi stok"}
          </div>
          <div className="flex gap-2 items-center">
            <input type="number" step="0.01" min="0.01" required autoFocus value={jumlah}
              onChange={(e) => setJumlah(e.target.value)} placeholder="Jumlah"
              className="input py-1.5 text-sm w-24 text-center" />
            <select required value={satuan} onChange={(e) => setSatuan(e.target.value)} className="input py-1.5 text-sm flex-1">
              <option value="">Satuan</option>
              {SATUAN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="submit" disabled={loading || !jumlah || !satuan}
              className={`flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0 transition-colors disabled:opacity-40 ${mode === "masuk" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}>
              {loading ? <span className="text-xs">…</span> : <Check size={14} />}
            </button>
            <button type="button" onClick={closeForm}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0 transition-colors">
              <X size={14} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
