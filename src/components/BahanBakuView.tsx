"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin } from "@/lib/auth";
import { formatAngka, formatBahan, formatBahanRingkas, capSatuan, formatTanggalWaktu, formatTanggal } from "@/lib/utils";
import { Plus, Minus, X, History, Check, FlaskConical, SlidersHorizontal, Trash2, AlertCircle, CheckCircle2, RotateCcw, TrendingDown, TrendingUp, Pencil } from "lucide-react";
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
// Keterangan yang bersifat internal/otomatis — disembunyikan dari tab Riwayat.
// Riwayat hanya menampilkan penerimaan manual dari supplier / stok koreksi.
function isInternalEntry(keterangan: string | null): boolean {
  if (!keterangan) return false;
  return (
    keterangan.startsWith("Produksi batch") ||
    keterangan.startsWith("Restore") ||
    keterangan.startsWith("proses_bikin::") ||
    keterangan.startsWith("Sisa dari") ||
    keterangan.startsWith("Over dari") ||
    keterangan.startsWith("Batal adj")
  );
}
interface RiwayatPemakaian {
  id: string; bahan_baku_id: string; jumlah_digunakan: number; satuan: string; created_at: string;
  bahan_baku: { nama: string };
  batch_produksi: { tanggal_produksi: string; produk_sku: { nama_brand: string; varian: string }; };
  users: { nama: string };
}
interface ProsesBikinRow {
  id: string; bahan_baku_id: string; jumlah: number; satuan: string; keterangan: string; created_at: string;
  tipe: "masuk" | "keluar";
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
  bahanId: string;
  namaBahan: string;
  jumlah: number;
  satuan: string;
  created_at: string;
  label: string;
  tanggal?: string;
  namaUser: string;
  isReturn?: boolean;   // koreksi packing aktual < rendam → bahan dikembalikan (+)
}

// Label mapping untuk proses bikin brand+varian key
const PROSES_BIKIN_LABEL: Record<string, Record<string, string>> = {
  cane:   { original:"Cane Original", melted_choco:"Cane Melted Choco", grated_cheese:"Cane Grated Cheese", wholewheat:"Cane Whole Wheat" },
  mehana: { original:"Mehana Original", cokelat:"Mehana Cokelat", keju:"Mehana Keju" },
};

const SATUAN_OPTIONS = ["ml", "gr", "kg", "liter", "pcs"];
// Minyak kini berbasis berat (kg/gr) — bukan volume. Bahan lain tetap semua opsi.
function satuanOptionsFor(nama: string): string[] {
  return nama === "Minyak" ? ["gr", "kg"] : SATUAN_OPTIONS;
}
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


type ActiveTab = "stok" | "riwayat" | "pemakaian";

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

// ── Stok default (baseline) per bahan baku ─────────────────────
const STOK_AWAL: Record<string, number> = {
  "Terigu":              500,
  "Minyak":              450,   // 500 liter → 450 kg (1 L = 0.9 kg)
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

// ── BahanBakuView ─────────────────────────────────────────────
export default function BahanBakuView() {
  const [user, setUser] = useState<ReturnType<typeof getUserSession>>(null);
  useEffect(() => { setUser(getUserSession()); }, []);

  const [bahanList,        setBahanList]        = useState<BahanBaku[]>([]);
  const [riwayat,           setRiwayat]           = useState<Riwayat[]>([]);
  const [riwayatPemakaian,  setRiwayatPemakaian]  = useState<RiwayatPemakaian[]>([]);
  const [riwayatProsesBikin,setRiwayatProsesBikin] = useState<ProsesBikinRow[]>([]);
  const [activeTab,        setActiveTab]        = useState<ActiveTab>("stok");
  const [resetKey,         setResetKey]         = useState(0);
  const [showResetModal,   setShowResetModal]   = useState(false);
  const [showResyncModal,  setShowResyncModal]  = useState(false);
  const [resyncLoading,    setResyncLoading]    = useState(false);
  const [resyncResult,     setResyncResult]     = useState<string | null>(null);
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

  // Adjustment inline (per-row in Riwayat tab)
  const [adjustments,  setAdjustments]  = useState<AdjustmentEntry[]>([]);
  const [editRowId,    setEditRowId]    = useState<string | null>(null);
  const [adjTipe,      setAdjTipe]      = useState<"sisa" | "over">("sisa");
  const [adjJumlah,    setAdjJumlah]    = useState("");
  const [adjSatuan,    setAdjSatuan]    = useState("");
  const [adjCatatan,   setAdjCatatan]   = useState("");
  const [adjLoading,   setAdjLoading]   = useState(false);
  const [adjError,     setAdjError]     = useState("");
  const [adjSuccess,   setAdjSuccess]   = useState<string | null>(null);

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
        .select(`id,bahan_baku_id,jumlah_digunakan,satuan,created_at,
          bahan_baku:bahan_baku_id(nama),
          batch_produksi:batch_produksi_id(tanggal_produksi,produk_sku:produk_sku_id(nama_brand,varian)),
          users:created_by(nama)`)
        .order("created_at", { ascending: false }).limit(500),
      // Riwayat Pemakaian sumber 2: Proses Bikin (penerimaan_bahan_baku tipe keluar proses_bikin)
      supabase.from("penerimaan_bahan_baku")
        .select("id,tipe,bahan_baku_id,jumlah,satuan,keterangan,created_at,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
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

  async function setStokLangsung(bahanId: string, nilai: number): Promise<boolean> {
    const { error } = await supabase.from("bahan_baku").update({ stok_saat_ini: nilai }).eq("id", bahanId);
    if (!error) fetchData();
    return !error;
  }

  function openEditPemakaian(entry: PemakaianEntry) {
    setEditRowId(entry.id);
    setAdjTipe("sisa");
    setAdjJumlah("");
    // Default ke "gr" atau "ml" agar user bisa input angka kecil yang intuitif.
    // Entry disimpan dalam Kg/Liter (sudah base), jadi default "gr"/"ml" lebih mudah.
    const eBase = entry.satuan.toLowerCase();
    const defaultSatuan =
      eBase === "kg" || eBase === "gr"       ? "gr"
      : eBase === "liter" || eBase === "ml"  ? "ml"
      : eBase;
    setAdjSatuan(defaultSatuan);
    setAdjCatatan("");
    setAdjError("");
    setAdjSuccess(null);
  }

  async function handleSaveAdjForRow(row: Riwayat) {
    if (!user || !adjJumlah || !adjSatuan) return;
    setAdjLoading(true);
    setAdjError("");

    const adj = parseFloat(adjJumlah);
    if (adj <= 0) { setAdjError("Jumlah harus lebih dari 0"); setAdjLoading(false); return; }

    if (!unitCompatible(adjSatuan, row.satuan)) {
      setAdjError(`Satuan tidak kompatibel: ${adjSatuan} vs ${row.satuan}.`);
      setAdjLoading(false);
      return;
    }

    const adjInBase  = toBase(adj, adjSatuan).value;
    const rowInBase  = toBase(row.jumlah, row.satuan).value;
    const newBase    = adjTipe === "sisa" ? rowInBase - adjInBase : rowInBase + adjInBase;
    if (newBase <= 0) {
      setAdjError(`Adjustment melebihi jumlah entry (${row.jumlah} ${row.satuan}).`);
      setAdjLoading(false);
      return;
    }

    // Konversi balik ke satuan asli row
    const baseToRowUnit = (v: number) => {
      const s = row.satuan.toLowerCase();
      return (s === "gr" || s === "ml") ? v * 1000 : v;
    };
    const newJumlah = baseToRowUnit(newBase);
    const adjNote   = ` | ${adjTipe === "sisa" ? "Sisa" : "Over"} ${adj}${adjSatuan} - Adj: ${user.nama}`;

    const { error: updateErr } = await supabase
      .from("penerimaan_bahan_baku")
      .update({ jumlah: newJumlah, keterangan: (row.keterangan ?? "") + adjNote })
      .eq("id", row.id);
    if (updateErr) { setAdjError("Gagal update: " + updateErr.message); setAdjLoading(false); return; }

    await supabase.from("adjustment_bahan_baku").insert({
      bahan_baku_id: row.bahan_baku_id,
      tipe: adjTipe,
      jumlah_adjustment: adj,
      satuan: adjSatuan,
      catatan: adjCatatan || null,
      jumlah_sebelum: row.jumlah,
      riwayat_id: row.id,
      created_by: user.id,
    });

    setAdjSuccess("Tersimpan!");
    setAdjLoading(false);
    setEditRowId(null);
    fetchData();
  }

  // Hitung preview adjustment sebelum/sesudah simpan — juga dipanggil dari render.
  function calcPemakaianAdj(entry: PemakaianEntry, adj: number, sat: string, tipe: "sisa" | "over") {
    if (!adj || adj <= 0 || !sat || !unitCompatible(sat, entry.satuan)) return null;
    const adjBase   = toBase(adj, sat);
    const entryBase = toBase(entry.jumlah, entry.satuan);
    const newBase   = tipe === "sisa" ? entryBase.value - adjBase.value : entryBase.value + adjBase.value;
    if (tipe === "sisa" && newBase <= 0) return null;
    // Konversi balik ke satuan asli entry — bulatkan 6 desimal untuk hindari floating point noise
    const s = entry.satuan.toLowerCase();
    const newJumlah = parseFloat(((s === "gr" || s === "ml") ? newBase * 1000 : newBase).toFixed(6));
    const insertJumlah = parseFloat(adjBase.value.toFixed(6));
    const insertSatuan = adjBase.base !== "unknown" ? adjBase.base : sat;
    return { newJumlah, insertJumlah, insertSatuan };
  }

  async function handleSaveAdjForPemakaian(entry: PemakaianEntry) {
    if (!user || !adjJumlah || !adjSatuan) return;
    setAdjLoading(true);
    setAdjError("");

    const adj = parseFloat(adjJumlah);
    if (isNaN(adj) || adj <= 0) {
      setAdjError("Jumlah harus lebih dari 0");
      setAdjLoading(false);
      return;
    }

    if (!unitCompatible(adjSatuan, entry.satuan)) {
      setAdjError(`Satuan tidak kompatibel: ${adjSatuan} vs ${entry.satuan}. Gunakan satuan yang sama jenis (gr/kg atau ml/liter).`);
      setAdjLoading(false);
      return;
    }

    const calc = calcPemakaianAdj(entry, adj, adjSatuan, adjTipe);
    if (!calc) {
      setAdjError(adjTipe === "sisa"
        ? `Jumlah sisa (${adj} ${adjSatuan}) melebihi atau sama dengan total pemakaian (${entry.jumlah} ${entry.satuan}).`
        : "Nilai tidak valid.");
      setAdjLoading(false);
      return;
    }

    const { newJumlah, insertJumlah, insertSatuan } = calc;
    const actualId = entry.id.replace(/^(prod|pb)-/, "");

    // RPC atomic: staleness check (row lock) + UPDATE source + INSERT kompensasi stok
    // dalam satu DB transaction — menjamin stok SELALU sinkron dengan pemakaian.
    const { data: rpcResult, error: rpcError } = await supabase.rpc("apply_pemakaian_adj", {
      p_sumber:          entry.sumber,
      p_source_id:       actualId,
      p_expected_jumlah: entry.jumlah,
      p_new_jumlah:      newJumlah,
      p_bahan_baku_id:   entry.bahanId,
      p_adj_jumlah:      insertJumlah,
      p_adj_satuan:      insertSatuan,
      p_adj_tipe:        adjTipe,
      p_keterangan:      `${adjTipe === "sisa" ? "Sisa" : "Over"} dari ${entry.label} | Adj: ${user.nama}`,
      p_user_id:         user.id,
    });

    if (rpcError) {
      setAdjError("Gagal menyimpan: " + rpcError.message);
      setAdjLoading(false);
      return;
    }

    const result = rpcResult as { ok: boolean; code?: string; message?: string; current_jumlah?: number; prev_jumlah?: number };
    if (!result.ok) {
      if (result.code === "STALE") {
        setAdjError(
          `${result.message} (nilai terbaru: ${result.current_jumlah} ${entry.satuan})`
        );
      } else {
        setAdjError(result.message ?? "Gagal menyimpan.");
      }
      setAdjLoading(false);
      return;
    }

    // Audit trail: INSERT ke adjustment_bahan_baku dari client (butuh RLS auth context)
    await supabase.from("adjustment_bahan_baku").insert({
      bahan_baku_id:     entry.bahanId,
      tipe:              adjTipe,
      jumlah_adjustment: adj,
      satuan:            adjSatuan,
      catatan:           adjCatatan || null,
      jumlah_sebelum:    result.prev_jumlah ?? entry.jumlah,
      riwayat_id:        actualId,
      created_by:        user.id,
    });

    setAdjSuccess(`Tersimpan! Pemakaian: ${entry.jumlah} → ${newJumlah} ${entry.satuan}`);
    setAdjLoading(false);
    setEditRowId(null);
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
    if (isInternalEntry(r.keterangan)) return false;
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
        bahanId:    r.bahan_baku_id,
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
      let isReturn = false;
      try {
        const jsonStr = r.keterangan.replace("proses_bikin::", "").split(" | ")[0];
        const json = JSON.parse(jsonStr);
        const brandLabels = PROSES_BIKIN_LABEL[json.brandKey] ?? {};
        const varianLabel = brandLabels[json.varianKey] ?? `Proses Bikin ${json.varianKey ?? ""}`;
        if (json.koreksi) {
          const s = json.selisih as number;
          label = `Koreksi Packing ${s > 0 ? "+" : ""}${s} pcs ${varianLabel}`;
          isReturn = r.tipe === "masuk";   // selisih < 0 → dikembalikan
        } else {
          label = varianLabel;
        }
      } catch {}
      return {
        id:         `pb-${r.id}`,
        sumber:     "proses_bikin",
        bahanId:    r.bahan_baku_id,
        namaBahan:  r.bahan_baku?.nama ?? "?",
        jumlah:     r.jumlah,
        satuan:     r.satuan,
        created_at: r.created_at,
        label,
        namaUser:   r.users?.nama ?? "",
        isReturn,
      };
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)); // terbaru di atas

  const pemakaianFiltered = allPemakaian.filter((r) => {
    const d = toWIBDate(r.created_at);
    if (d < paRange.start || d > paRange.end) return false;
    if (filterPemakaianBahan && !r.namaBahan.toLowerCase().includes(filterPemakaianBahan.toLowerCase())) return false;
    return true;
  });


  async function doReset() {
    setShowResetModal(false);
    // Hapus semua riwayat penerimaan & pengurangan
    await supabase.from("penerimaan_bahan_baku").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    // Hapus semua adjustment
    await supabase.from("adjustment_bahan_baku").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    // Reset stok setiap bahan ke nilai default (STOK_AWAL)
    for (const bahan of bahanList) {
      const defaultStok = STOK_AWAL[bahan.nama];
      if (defaultStok !== undefined) {
        await supabase
          .from("bahan_baku")
          .update({ stok_saat_ini: defaultStok })
          .eq("id", bahan.id);
      }
    }
    // Reset UI state
    const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
    setPreset("hari_ini"); setCustomStart(""); setCustomEnd(""); setSelectedBulan(thisMonth);
    setRPreset("hari_ini"); setRCustomStart(""); setRCustomEnd(""); setRSelectedBulan(thisMonth);
    setRBahanId("");
    setFilterPemakaianBahan("");
    setEditRowId(null); setAdjTipe("sisa"); setAdjJumlah(""); setAdjSatuan(""); setAdjCatatan(""); setAdjError(""); setAdjSuccess(null);
    setResetKey(k => k + 1);
    setActiveTab("stok");
    fetchData();
  }

  async function doResync() {
    setResyncLoading(true);
    setResyncResult(null);
    const { data, error } = await supabase.rpc("resync_stok_bahan");
    if (error) {
      setResyncResult("Gagal: " + error.message);
    } else {
      const r = data as { ok: boolean; updated?: number; message?: string };
      if (r.ok) {
        setResyncResult(`Stok berhasil disinkronkan (${r.updated ?? 0} bahan diperbarui).`);
        fetchData();
      } else {
        setResyncResult("Gagal: " + (r.message ?? "unknown error"));
      }
    }
    setResyncLoading(false);
  }

  // PIC = terbatas: bisa Tambah stok & adjustment Sisa/Over, tapi tidak bisa Kurangi/Reset
  const readOnly = user?.role === "pic";
  const isPic    = user?.role === "pic";
  const bolehAdjust = !readOnly || isPic; // PIC boleh edit Sisa/Over di tab Pemakaian

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "stok",      label: "Stok Saat Ini" },
    { key: "riwayat",   label: "Riwayat" },
    { key: "pemakaian", label: "Pemakaian" },
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
        {canAccessAdmin(user?.role ?? "") && (
          <button type="button" onClick={() => { setShowResyncModal(true); setResyncResult(null); }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors shrink-0">
            <CheckCircle2 size={11} /> Sinkron
          </button>
        )}
        {!readOnly && (
          <button type="button" onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors shrink-0">
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {/* ── Tab: Stok ── */}
      {activeTab === "stok" && (
        <div className="card">
          <div className="space-y-2">
            {bahanList.map((b) => (
              <BahanCard
                key={`${b.id}-${resetKey}`}
                bahan={b}
                onSubmit={submitTransaksi}
                isSuperAdmin={canAccessAdmin(user?.role ?? "")}
                onDirectSet={setStokLangsung}
                canKurangi={user?.role !== "staff_produksi"}
                readOnly={readOnly}
                addOnly={user?.role === "pic"}
              />
            ))}
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
                    const rowAdjs = adjustments.filter((a) => a.riwayat_id === r.id);
                    return (
                      <div key={r.id} className="border-b border-gray-50 pb-2.5 last:border-0 last:pb-0">
                        {/* Row utama */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${masuk ? "text-green-600" : "text-red-500"}`}>
                              {masuk ? "+" : "−"} {formatAngka(r.jumlah)} {r.satuan} — {r.bahan_baku?.nama}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatTanggal(r.tanggal)} · Oleh: <span className="font-medium text-gray-600">{r.users?.nama ?? "—"}</span>
                            </p>
                            <p className="text-xs text-gray-300">{formatTanggalWaktu(r.created_at)}</p>
                            {rowAdjs.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {rowAdjs.map((a) => (
                                  <div key={a.id} className="flex items-center gap-1.5">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${a.tipe === "sisa" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                      {a.tipe === "sisa" ? "↑ Sisa" : "↓ Over"} {formatAngka(a.jumlah_adjustment)} {a.satuan}
                                    </span>
                                    {bolehAdjust && (
                                      <button type="button" onClick={() => handleDeleteAdjustment(a)}
                                        className="text-gray-300 hover:text-red-400 transition-colors" title="Hapus adjustment">
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${masuk ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                            {masuk ? "Penerimaan" : "Pengurangan"}
                          </span>
                        </div>
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
              // Koreksi return (bahan dikembalikan) mengurangi total pemakaian
              totals[r.namaBahan].jumlah += r.isReturn ? -r.jumlah : r.jumlah;
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
                    <span className="text-xs font-bold text-white">{formatBahanRingkas(jumlah)} {capSatuan(satuan)}</span>
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
                : pemakaianFiltered.map((r) => {
                    const isEditing = editRowId === r.id;
                    const actualId  = r.id.replace(/^(prod|pb)-/, "");
                    const rowAdjs   = adjustments.filter((a) => a.riwayat_id === actualId);
                    return (
                      <div key={r.id} className="border-b border-gray-50 pb-2.5 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${r.isReturn ? "text-green-600" : "text-red-500"}`}>
                              {r.isReturn ? "+" : "−"} {formatBahan(r.jumlah, r.satuan)} {capSatuan(r.satuan)} — {r.namaBahan}
                              {r.isReturn && <span className="text-green-500 font-normal"> dikembalikan</span>}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              dari <span className="font-medium">{r.label}</span>
                              {r.tanggal ? `, ${formatTanggal(r.tanggal)}` : ""}
                            </p>
                            <p className="text-xs text-gray-400">Oleh: <span className="font-medium text-gray-500">{r.namaUser || "—"}</span> · {formatTanggalWaktu(r.created_at)}</p>
                            {rowAdjs.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {rowAdjs.map((a) => (
                                  <div key={a.id} className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${a.tipe === "sisa" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                      {a.tipe === "sisa" ? "↑ Sisa" : "↓ Over"} {formatBahan(a.jumlah_adjustment, a.satuan)} {a.satuan}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      oleh <span className="font-medium text-gray-500">{a.users?.nama ?? "—"}</span> · {formatTanggalWaktu(a.created_at)}
                                    </span>
                                    {a.catatan && <span className="text-[10px] text-gray-400 italic">"{a.catatan}"</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              r.sumber === "produksi" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                            }`}>
                              {r.sumber === "produksi" ? "Produksi" : "Proses Bikin"}
                            </span>
                            {bolehAdjust && (
                              <button type="button"
                                onClick={() => isEditing ? setEditRowId(null) : openEditPemakaian(r)}
                                className={`p-1.5 rounded-lg transition-colors ${isEditing ? "bg-amber-100 text-amber-600" : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"}`}
                                title="Edit Sisa/Over">
                                <SlidersHorizontal size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && (() => {
                          const adjNum = parseFloat(adjJumlah);
                          const preview = !isNaN(adjNum) && adjNum > 0 && adjSatuan
                            ? calcPemakaianAdj(r, adjNum, adjSatuan, adjTipe)
                            : null;
                          const satIncompat = adjSatuan && !unitCompatible(adjSatuan, r.satuan);
                          return (
                            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-amber-700">Adjustment: {r.namaBahan}</p>
                                <p className="text-xs text-gray-500">Pemakaian saat ini: <span className="font-bold text-gray-700">{formatBahan(r.jumlah, r.satuan)} {r.satuan}</span></p>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setAdjTipe("sisa")}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${adjTipe === "sisa" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-500"}`}>
                                  ↑ Sisa (kembalikan ke stok)
                                </button>
                                <button type="button" onClick={() => setAdjTipe("over")}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${adjTipe === "over" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-500"}`}>
                                  ↓ Over (kurangi stok lagi)
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <input type="number" step="0.01" min="0.01" placeholder="Jumlah"
                                  className="input text-sm py-1.5 flex-1 text-center"
                                  value={adjJumlah} onChange={(e) => setAdjJumlah(e.target.value)} />
                                <select className="input text-sm py-1.5 w-24"
                                  value={adjSatuan} onChange={(e) => setAdjSatuan(e.target.value)}>
                                  <option value="">Satuan</option>
                                  {satuanOptionsFor(r.namaBahan).map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              {/* Live preview */}
                              {adjJumlah && adjSatuan && (
                                satIncompat
                                  ? <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">Satuan {adjSatuan} tidak kompatibel dengan {r.satuan}</p>
                                  : preview
                                    ? <p className="text-xs bg-white rounded px-2 py-1 border border-amber-200">
                                        Pemakaian: <span className="font-bold text-gray-700">{formatBahan(r.jumlah, r.satuan)} {r.satuan}</span>
                                        {" → "}
                                        <span className={`font-bold ${adjTipe === "sisa" ? "text-green-600" : "text-red-600"}`}>{formatBahan(preview.newJumlah, r.satuan)} {r.satuan}</span>
                                        <span className="text-gray-400 ml-1">
                                          ({adjTipe === "sisa" ? "stok +" : "stok −"}{formatBahan(preview.insertJumlah, preview.insertSatuan)} {preview.insertSatuan})
                                        </span>
                                      </p>
                                    : <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">Jumlah sisa melebihi pemakaian saat ini</p>
                              )}
                              <input type="text" placeholder="Catatan (opsional)"
                                className="input text-sm py-1.5 w-full"
                                value={adjCatatan} onChange={(e) => setAdjCatatan(e.target.value)} />
                              {adjError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1 whitespace-pre-wrap">{adjError}</p>}
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setEditRowId(null)}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50">
                                  Batal
                                </button>
                                <button type="button"
                                  disabled={adjLoading || !adjJumlah || !adjSatuan || !preview}
                                  onClick={() => handleSaveAdjForPemakaian(r)}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                                  {adjLoading ? "Menyimpan..." : "Simpan"}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      )}

      {/* ── Sinkronkan Stok Modal ── */}
      {showResyncModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-blue-500" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">Sinkronkan Stok?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hitung ulang stok setiap bahan dari semua riwayat penerimaan (masuk − keluar) + stok awal.
                  Berguna untuk memperbaiki data yang tidak sinkron akibat bug lama.
                </p>
              </div>
            </div>
            {resyncResult && (
              <p className={`text-xs px-3 py-2 rounded-lg ${resyncResult.startsWith("Gagal") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                {resyncResult}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowResyncModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                {resyncResult ? "Tutup" : "Batal"}
              </button>
              {!resyncResult && (
                <button type="button" onClick={doResync} disabled={resyncLoading}
                  className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60">
                  {resyncLoading ? "Memproses..." : "Ya, Sinkronkan"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Konfirmasi Reset Modal ── */}
      {showResetModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <RotateCcw size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">Reset Stok Bahan Baku?</p>
                <p className="text-xs text-gray-500 mt-0.5">Stok dikembalikan ke nilai awal. Semua riwayat & adjustment akan dihapus permanen.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowResetModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Batal
              </button>
              <button type="button" onClick={doReset}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">
                Ya, Reset
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


// ── BahanCard ────────────────────────────────────────────────
function BahanCard({ bahan, onSubmit, isSuperAdmin, onDirectSet, canKurangi, readOnly, addOnly }: {
  bahan: BahanBaku;
  onSubmit: (id: string, tipe: "masuk" | "keluar", jumlah: number, satuan: string) => Promise<boolean>;
  isSuperAdmin: boolean;
  onDirectSet: (id: string, nilai: number) => Promise<boolean>;
  canKurangi: boolean;
  readOnly?: boolean;
  addOnly?: boolean;
}) {
  const kritis = bahan.stok_saat_ini <= bahan.stok_minimum;
  const [mode,        setMode]        = useState<"masuk" | "keluar" | null>(null);
  const [jumlah,      setJumlah]      = useState("");
  const [satuan,      setSatuan]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [editingStok, setEditingStok] = useState(false);
  const [stokInput,   setStokInput]   = useState("");
  const [stokLoading, setStokLoading] = useState(false);

  function openForm(tipe: "masuk" | "keluar") { setMode(tipe); setJumlah(""); setSatuan(""); setEditingStok(false); }
  function closeForm() { setMode(null); setJumlah(""); setSatuan(""); }

  function openEditStok() {
    setEditingStok(true);
    setStokInput(String(bahan.stok_saat_ini));
    setMode(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jumlah || !satuan || !mode) return;
    setLoading(true);
    const ok = await onSubmit(bahan.id, mode, parseFloat(jumlah), satuan);
    setLoading(false);
    if (ok) closeForm();
  }

  async function handleSaveStok(e: React.FormEvent) {
    e.preventDefault();
    const nilai = parseFloat(stokInput);
    if (isNaN(nilai) || nilai < 0) return;
    setStokLoading(true);
    const ok = await onDirectSet(bahan.id, nilai);
    setStokLoading(false);
    if (ok) setEditingStok(false);
  }

  const adaPengurangan = false;

  return (
    <div className={`rounded-xl border p-3 transition-all ${kritis ? "bg-red-50 border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-semibold text-sm ${kritis ? "text-red-700" : "text-gray-800"}`}>{bahan.nama}</p>
          <p className="text-xs text-gray-400">Min: {formatAngka(bahan.stok_minimum)} {bahan.satuan}</p>
          {kritis && <p className="text-xs text-red-500 font-medium mt-0.5">⚠ Stok kritis!</p>}
        </div>
        <div className="text-right ml-3 shrink-0">
          {editingStok ? (
            <form onSubmit={handleSaveStok} className="flex items-center gap-1.5">
              <input
                type="number" step="0.001" min="0" autoFocus
                value={stokInput} onChange={(e) => setStokInput(e.target.value)}
                className="input py-1 text-sm w-24 text-center font-bold"
              />
              <span className="text-xs text-gray-400">{bahan.satuan}</span>
              <button type="submit" disabled={stokLoading || stokInput === ""}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 shrink-0">
                {stokLoading ? <span className="text-[10px]">…</span> : <Check size={12} />}
              </button>
              <button type="button" onClick={() => setEditingStok(false)}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0">
                <X size={12} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5 justify-end">
              <div>
                <p className={`font-bold text-xl leading-none ${kritis ? "text-red-600" : "text-gray-800"}`}>
                  {formatAngka(bahan.stok_saat_ini)}
                  <span className="text-sm font-normal text-gray-400 ml-1">{bahan.satuan}</span>
                </p>
                {adaPengurangan && (
                  <p className="text-xs mt-0.5 flex items-center justify-end gap-0.5">
                    <span style={{ color: "#EF4444" }} className="font-bold text-sm">↓</span>
                    <span style={{ color: "#EF4444" }} className="font-semibold">
                      {formatAngka(pengurangan)} {bahan.satuan}
                    </span>
                  </p>
                )}
              </div>
              {isSuperAdmin && (
                <button type="button" onClick={openEditStok}
                  className="p-1 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors shrink-0 self-start mt-0.5"
                  title="Set stok langsung (tanpa riwayat)">
                  <Pencil size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!mode && !editingStok && (!readOnly || addOnly) && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => openForm("masuk")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
            <Plus size={12} /> Tambah
          </button>
          {canKurangi && !addOnly && (
            <button onClick={() => openForm("keluar")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
              <Minus size={12} /> Kurangi
            </button>
          )}
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
              {satuanOptionsFor(bahan.nama).map((s) => <option key={s} value={s}>{s}</option>)}
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
