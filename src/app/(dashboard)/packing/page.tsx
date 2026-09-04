"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { formatAngka, formatBahan, formatTanggal, formatTanggalWaktu } from "@/lib/utils";
import { tambahPoin, pelanggaranOtomatisId } from "@/lib/poin";
import { ChevronLeft, ChevronRight, X, CheckCircle, History, RotateCcw, AlertTriangle, Trash2, ChevronDown, CalendarDays } from "lucide-react";
import BahanBakuView from "@/components/BahanBakuView";
import { RiwayatFilter, getRiwayatRange } from "@/components/RiwayatFilter";
import type { RiwayatPreset } from "@/components/RiwayatFilter";

// ── Types ─────────────────────────────────────────────────────
interface ProdukSku { id: string; brand: string; varian: string; isi_per_pack: number; }
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
  rendam_at: string | null;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number };
  users: { nama: string };
}

interface PackingInput {
  id: string;
  batch_produksi_id: string | null;
  produk_sku_id: string | null;
  brand: string;
  varian: string;
  tanggal: string;
  total_direndam: number;
  carry_in: number;
  total_available: number;
  pack5: number;
  pack10: number;
  reject: number;
  reject_lain: number;
  alasan_reject_lain: string | null;
  lebihan: number;
  catatan: string | null;
  created_at: string;
  users?: { nama: string };
}

interface SelisihRow {
  id: string;
  batch_packing_id: string;
  total_direndam: number;
  total_aktual: number;
  selisih_pcs: number;
  catatan: string | null;
  nama_user: string;
  status_review: string;
}

const ALASAN_REJECT_LAIN = [
  { key: "basi",        label: "Basi" },
  { key: "hilang",      label: "Hilang" },
  { key: "salah_resep", label: "Salah Resep" },
  { key: "lainnya",     label: "Lainnya" },
];

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

// Tanggal WIB (Asia/Jakarta) — selalu real-time, tidak hardcode
function wibDateStr(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  // en-CA menghasilkan format YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ── Konversi satuan resep → satuan stok ───────────────────────
function toBaseUnit(jumlah: number, satuan: string): { jumlah: number; satuan: string } {
  switch (satuan) {
    case "gr": return { jumlah: jumlah / 1000, satuan: "Kg" };
    case "ml": return { jumlah: jumlah / 1000, satuan: "Liter" };
    case "L":  return { jumlah, satuan: "Liter" };
    default:   return { jumlah, satuan };
  }
}

export default function PackingPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUserSession>>(null);
  const [mounted, setMounted] = useState(false);
  const today = localDateStr(new Date());

  useEffect(() => {
    const u = getUserSession();
    setUser(u);
    setMounted(true);
    const caps = getCapabilities(u);
    // Route guard
    if (u && !caps.bahanBaku && !caps.produksiFlow) {
      router.replace(homeRoute(u));
    }
    // Set tabs berdasarkan capability setelah mount
    if (caps.produksiFlow) setTopTab("packing");
    if (!caps.adonan && caps.rendam) setActiveTab("bikin");
    else if (!caps.adonan && !caps.rendam && caps.packingFreezer) setActiveTab("packing");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const caps = getCapabilities(user);

  // Tick setiap 60 detik → paksa re-render agar filter tanggal selalu real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [skuList,     setSkuList]     = useState<ProdukSku[]>([]);
  const [bahanMap,    setBahanMap]    = useState<Record<string, string>>({});
  const [allBatches,  setAllBatches]  = useState<Batch[]>([]);
  const [topTab,      setTopTab]      = useState<"bahan" | "packing">("bahan");
  const [activeTab,   setActiveTab]   = useState<Stage | "riwayat" | "reject">("adonan");
  const [busy,        setBusy]        = useState(false);

  // Input Stok (Packing & Freezer)
  const [packingInputs,  setPackingInputs]  = useState<PackingInput[]>([]);
  const [selisihList,    setSelisihList]    = useState<SelisihRow[]>([]);
  const [expandRiwayat,  setExpandRiwayat]  = useState<string | null>(null);
  const [inputStokModal, setInputStokModal] = useState<{ batch: Batch; carryIn: number; carryFromDate: string | null } | null>(null);

  // Adonan input form
  const [adonanForm,  setAdonanForm]  = useState<{ tanggal: string; cane: Record<string, string>; mehana: Record<string, string> }>({ tanggal: today, cane: {}, mehana: {} });
  const [submitting,  setSubmitting]  = useState<BrandKey | null>(null);
  const [stockError,  setStockError]  = useState<string[]>([]);

  // Packing & Freezer modal (input actual pcs direndam)
  const [packingModal, setPackingModal] = useState<{ batch: Batch } | null>(null);
  const [packingForm,  setPackingForm]  = useState({ pcs: "", catatan: "" });
  const [toast,        setToast]        = useState<string | null>(null);

  // Riwayat filter
  const [rejectView,    setRejectView]    = useState<"semua" | "reject" | "lain">("semua");
  const [preset,        setPreset]        = useState<RiwayatPreset>("hari_ini");
  const [customStart,   setCustomStart]   = useState(() => wibDateStr());
  const [customEnd,     setCustomEnd]     = useState(() => wibDateStr());
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Delete riwayat confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Batch | null>(null);

  // ── Fetch ───────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const ch = supabase.channel("packing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_produksi" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_input" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch saat filter berubah agar data selalu fresh dari DB
  useEffect(() => { fetchData(); }, [preset, customStart, customEnd, selectedBulan]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [skuRes, bahanRes, batchRes, packingRes, selisihRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, varian, isi_per_pack").eq("aktif", true),
      supabase.from("bahan_baku").select("id, nama").eq("aktif", true),
      supabase.from("batch_produksi")
        .select("id, produk_sku_id, tanggal_produksi, status, jumlah_pack_rencana, jumlah_pack_adonan, jumlah_pack_packing, jumlah_pack_freezer, catatan_reject, status_updated_at, created_at, rendam_at, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack), users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(300),
      supabase.from("packing_input")
        .select("id, batch_produksi_id, produk_sku_id, brand, varian, tanggal, total_direndam, carry_in, total_available, pack5, pack10, reject, reject_lain, alasan_reject_lain, lebihan, catatan, created_at, users:created_by(nama)")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("selisih_packing")
        .select("id, batch_packing_id, total_direndam, total_aktual, selisih_pcs, catatan, nama_user, status_review")
        .limit(500),
    ]);
    if (packingRes.data) setPackingInputs(packingRes.data as unknown as PackingInput[]);
    if (selisihRes.data) setSelisihList(selisihRes.data as SelisihRow[]);
    if (skuRes.data) setSkuList(skuRes.data as ProdukSku[]);
    if (bahanRes.data) {
      const m: Record<string, string> = {};
      for (const b of bahanRes.data as { id: string; nama: string }[]) m[b.nama] = b.id;
      setBahanMap(m);
    }
    if (batchRes.data) {
      const batches = batchRes.data as unknown as Batch[];
      setAllBatches(batches);
      // Restore adonan form values from DB so state persists across navigation
      const adonanBatches = batches.filter((b) => b.status === "adonan");
      if (adonanBatches.length > 0) {
        const cane: Record<string, string> = {};
        const mehana: Record<string, string> = {};
        for (const b of adonanBatches) {
          const bk = brandKeyFromNama((b.produk_sku as { nama_brand: string })?.nama_brand ?? "");
          if (!bk) continue;
          const v = BRANDS[bk].variants.find((x) => x.varianDB === (b.produk_sku as { varian: string })?.varian);
          if (!v) continue;
          if (bk === "cane") cane[v.key] = String(b.jumlah_pack_rencana);
          else mehana[v.key] = String(b.jumlah_pack_rencana);
        }
        setAdonanForm((f) => ({
          ...f,
          ...(Object.keys(cane).length   > 0 ? { cane }   : {}),
          ...(Object.keys(mehana).length > 0 ? { mehana } : {}),
        }));
      }
    }
  }

  const active = allBatches.filter((b) => b.status !== "selesai");
  function countFor(stage: Stage) {
    if (stage === "packing") return active.filter((b) => b.status === "packing" || b.status === "freezer").length;
    return active.filter((b) => b.status === stage).length;
  }
  // Derive saved-adonan batches from DB — no React state needed
  function adonanBatchesForBrand(bk: BrandKey): Batch[] {
    return active.filter((b) => b.status === "adonan" && brandKeyFromNama((b.produk_sku as { nama_brand: string })?.nama_brand ?? "") === bk);
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
  // Kalau SATU SAJA insert gagal (network/apapun), jangan diam-diam lanjut —
  // kumpulkan error-nya lalu lempar, supaya pemanggil bisa kasih tahu user
  // persis bahan mana yang GAGAL terpotong (bukan ketahuan sebulan kemudian
  // pas stock opname).
  async function applyIngredients(batchId: string, skuId: string, kg: number, tanggal: string) {
    if (!user) return;
    const resep = await fetchResep(skuId);
    const gagal: string[] = [];
    for (const r of resep) {
      const { jumlah, satuan } = toBaseUnit(r.jumlah_per_pack * kg, r.satuan);
      const e1 = await supabase.from("penggunaan_bahan").insert({ batch_produksi_id: batchId, bahan_baku_id: r.bahan_baku_id, jumlah_digunakan: jumlah, satuan, created_by: user.id });
      const e2 = await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: r.bahan_baku_id, jumlah, satuan, tipe: "keluar", tanggal, keterangan: `Produksi batch #${batchId.slice(0, 8)}`, created_by: user.id });
      if (e1.error || e2.error) gagal.push(r.bahan_baku_id);
    }
    if (gagal.length) throw new Error(`Gagal memotong stok untuk ${gagal.length} bahan (id: ${gagal.join(", ")}). Cek Bahan Baku & tambahkan manual kalau perlu.`);
  }
  async function restoreIngredients(batchId: string, tanggal: string) {
    if (!user) return;
    const { data } = await supabase.from("penggunaan_bahan").select("id, bahan_baku_id, jumlah_digunakan, satuan").eq("batch_produksi_id", batchId);
    const list = (data as PenggunaanBahan[] | null) ?? [];
    const gagal: string[] = [];
    for (const p of list) {
      const { error } = await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: p.bahan_baku_id, jumlah: p.jumlah_digunakan, satuan: p.satuan, tipe: "masuk", tanggal, keterangan: `Restore adonan batch #${batchId.slice(0, 8)}`, created_by: user.id });
      if (error) gagal.push(p.bahan_baku_id);
    }
    if (list.length) await supabase.from("penggunaan_bahan").delete().eq("batch_produksi_id", batchId);
    if (gagal.length) throw new Error(`Gagal mengembalikan stok untuk ${gagal.length} bahan. Cek Bahan Baku manual.`);
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

  // ── Rendam ingredient helpers (bahan tambahan dari resep_bikin) ──
  async function applyRendam(batch: Batch, actualPcs: number) {
    if (!user) return;
    const cfg = findVarian(batch);
    if (!cfg) return;
    const { data } = await supabase
      .from("resep_bikin")
      .select("bahan_baku_id, jumlah_per_kg")
      .eq("produk_sku_id", batch.produk_sku_id);
    const resep = (data as { bahan_baku_id: string; jumlah_per_kg: number }[] | null) ?? [];
    if (!resep.length) return;
    const meta = JSON.stringify({ batchId: batch.id, brandKey: cfg.brandKey, brandLabel: cfg.brandLabel, varianKey: cfg.key, varianLabel: cfg.label, tanggal: batch.tanggal_produksi });
    const gagal: string[] = [];
    for (const r of resep) {
      // gr/kg ÷ standar pcs/kg × actual pcs → convert ke Kg
      const grPerPcs = r.jumlah_per_kg / cfg.pcs_per_kg;
      const jumlahKg = (grPerPcs * actualPcs) / 1000;
      const { error } = await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: r.bahan_baku_id, jumlah: jumlahKg, satuan: "Kg",
        tipe: "keluar", tanggal: batch.tanggal_produksi, keterangan: "proses_bikin::" + meta, created_by: user.id,
      });
      if (error) gagal.push(r.bahan_baku_id);
    }
    if (gagal.length) throw new Error(`Gagal memotong stok rendam untuk ${gagal.length} bahan. Cek Bahan Baku & tambahkan manual kalau perlu.`);
  }
  async function restoreRendam(batch: Batch) {
    if (!user) return;
    // Ambil SEMUA entri proses_bikin batch ini (rendam + koreksi packing),
    // tipe apapun. Balik dengan tipe lawan supaya stok kembali persis.
    const { data } = await supabase.from("penerimaan_bahan_baku")
      .select("id, bahan_baku_id, jumlah, satuan, tipe")
      .like("keterangan", `proses_bikin::{"batchId":"${batch.id}"%`);
    const rows = (data as { id: string; bahan_baku_id: string; jumlah: number; satuan: string; tipe: string }[] | null) ?? [];
    const gagal: string[] = [];
    for (const r of rows) {
      const lawan = r.tipe === "keluar" ? "masuk" : "keluar";
      const { error } = await supabase.from("penerimaan_bahan_baku").insert({ bahan_baku_id: r.bahan_baku_id, jumlah: r.jumlah, satuan: r.satuan, tipe: lawan, tanggal: batch.tanggal_produksi, keterangan: `Restore rendam batch #${batch.id.slice(0, 8)}`, created_by: user.id });
      if (error) gagal.push(r.bahan_baku_id);
    }
    const ids = rows.map((r) => r.id);
    if (ids.length) await supabase.from("penerimaan_bahan_baku").delete().in("id", ids);
    if (gagal.length) throw new Error(`Gagal mengembalikan stok rendam untuk ${gagal.length} bahan. Cek Bahan Baku manual.`);
  }

  // ── Koreksi bahan baku berdasarkan selisih pcs (aktual vs rendam) ──
  // selisihPcs > 0 → aktual lebih → bahan dikurangi lagi (tipe keluar)
  // selisihPcs < 0 → aktual kurang → bahan dikembalikan (tipe masuk)
  async function applyKoreksiBahan(batch: Batch, selisihPcs: number) {
    if (!user || selisihPcs === 0) return;
    const cfg = findVarian(batch);
    if (!cfg) return;
    const { data } = await supabase
      .from("resep_bikin")
      .select("bahan_baku_id, jumlah_per_kg")
      .eq("produk_sku_id", batch.produk_sku_id);
    const resep = (data as { bahan_baku_id: string; jumlah_per_kg: number }[] | null) ?? [];
    if (!resep.length) return;
    const tipe = selisihPcs > 0 ? "keluar" : "masuk";
    const absPcs = Math.abs(selisihPcs);
    const meta = JSON.stringify({
      batchId: batch.id, brandKey: cfg.brandKey, brandLabel: cfg.brandLabel,
      varianKey: cfg.key, varianLabel: cfg.label, tanggal: batch.tanggal_produksi,
      koreksi: true, selisih: selisihPcs, userName: user.nama ?? "",
    });
    const gagal: string[] = [];
    for (const r of resep) {
      const grPerPcs = r.jumlah_per_kg / cfg.pcs_per_kg;
      const jumlahKg = (grPerPcs * absPcs) / 1000;
      if (jumlahKg <= 0) continue;
      const { error } = await supabase.from("penerimaan_bahan_baku").insert({
        bahan_baku_id: r.bahan_baku_id, jumlah: jumlahKg, satuan: "Kg",
        tipe, tanggal: batch.tanggal_produksi, keterangan: "proses_bikin::" + meta, created_by: user.id,
      });
      if (error) gagal.push(r.bahan_baku_id);
    }
    if (gagal.length) throw new Error(`Gagal koreksi stok untuk ${gagal.length} bahan. Cek Bahan Baku & tambahkan manual kalau perlu.`);
  }

  // ── Poin otomatis reject basi: semua karyawan shift di tanggal produksi +0.5 ──
  async function applyPoinRejectBasi(tglProduksi: string) {
    const pid = await pelanggaranOtomatisId("Reject basi (bukan reject teknikal)");
    if (!pid) return;
    // guard duplikat: sudah diberikan untuk tanggal ini?
    const { data: existing } = await supabase.from("poin_karyawan").select("id").eq("pelanggaran_id", pid).eq("tanggal", tglProduksi).limit(1);
    if (existing && existing.length) return;
    const { data: asg } = await supabase.from("shift_assignment").select("karyawan_id")
      .eq("tanggal", tglProduksi).eq("is_libur", false).not("shift_id", "is", null);
    const ids = Array.from(new Set(((asg as { karyawan_id: string }[] | null) ?? []).map((a) => a.karyawan_id)));
    for (const kid of ids) {
      await tambahPoin({ karyawan_id: kid, pelanggaran_id: pid, poin: 0.5, sumber: "otomatis", tanggal: tglProduksi, catatan: `Reject basi tanggal ${tglProduksi}` });
    }
  }

  // ── Catat selisih packing untuk review Super Admin ──────────
  async function recordSelisihPacking(batch: Batch, totalDirendam: number, totalAktual: number, selisihPcs: number, catatan: string) {
    if (!user) return;
    const cfg = findVarian(batch);
    await supabase.from("selisih_packing").insert({
      batch_packing_id: batch.id,
      brand: cfg?.brandKey ?? "", varian: cfg?.varianDB ?? batch.produk_sku?.varian ?? "",
      total_direndam: totalDirendam, total_aktual: totalAktual, selisih_pcs: selisihPcs,
      catatan: catatan || null, nama_user: user.nama ?? "", status_review: "pending",
    });
  }

  // ── Produk jadi stok (tanpa trigger — update langsung) ──────
  async function adjustProdukJadi(skuId: string, delta: number) {
    const { data } = await supabase.from("produk_sku").select("stok_saat_ini").eq("id", skuId).single();
    const cur = (data as { stok_saat_ini: number } | null)?.stok_saat_ini ?? 0;
    await supabase.from("produk_sku").update({ stok_saat_ini: Math.max(0, cur + delta) }).eq("id", skuId);
  }

  // ── Stok produk reject (pcs) — reject packing masuk ke sini ──
  async function adjustStokReject(brand: string, varian: string, deltaPcs: number) {
    if (deltaPcs === 0) return;
    const { data } = await supabase
      .from("stok_produk_reject")
      .select("id, stok_pcs")
      .eq("brand", brand).eq("varian", varian)
      .maybeSingle();
    const row = data as { id: string; stok_pcs: number } | null;
    if (!row) return;
    await supabase.from("stok_produk_reject")
      .update({ stok_pcs: Math.max(0, row.stok_pcs + deltaPcs), updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  // ── STAGE 1: submit adonan ──────────────────────────────────
  async function doCreateAdonan(brandKey: BrandKey): Promise<Batch[]> {
    if (!user) return [];
    const kgMap = brandKey === "cane" ? adonanForm.cane : adonanForm.mehana;
    const variants = BRANDS[brandKey].variants.filter((v) => parseFloat(kgMap[v.key] || "0") > 0);
    if (!variants.length) return [];

    setStockError([]);
    const errors = await validateStock(brandKey, kgMap);
    if (errors.length) { setStockError(errors); return []; }

    const cfg = BRANDS[brandKey];
    const created: Batch[] = [];
    for (const v of variants) {
      const kg = parseFloat(kgMap[v.key]);
      const skuId = getSkuId(brandKey, v.varianDB);
      if (!skuId) continue;
      const { data, error } = await supabase.from("batch_produksi").insert({
        produk_sku_id: skuId, tanggal_produksi: adonanForm.tanggal, shift: "pagi",
        jumlah_pack_rencana: kg, jumlah_pack_adonan: null, status: "adonan", created_by: user.id,
      }).select("id").single();
      if (!error && data) {
        const batchId = (data as { id: string }).id;
        await applyIngredients(batchId, skuId, kg, adonanForm.tanggal);
        created.push({
          id: batchId, produk_sku_id: skuId, tanggal_produksi: adonanForm.tanggal,
          status: "adonan", jumlah_pack_rencana: kg, jumlah_pack_adonan: null,
          jumlah_pack_packing: null, jumlah_pack_freezer: null, catatan_reject: null,
          status_updated_at: new Date().toISOString(), created_at: new Date().toISOString(), rendam_at: null,
          produk_sku: { nama_brand: cfg.label, varian: v.varianDB, isi_per_pack: 0 },
          users: { nama: user.nama },
        });
      }
    }
    return created;
  }

  async function submitAdonan(brandKey: BrandKey) {
    setSubmitting(brandKey);
    try {
      await doCreateAdonan(brandKey);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memotong stok bahan baku — cek Bahan Baku manual.");
    }
    setSubmitting(null);
    fetchData();
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Adonan → Rendam: pindah langsung tanpa modal
  async function moveBrandToRendam(bk: BrandKey) {
    if (!user) return;
    const batches = adonanBatchesForBrand(bk);
    if (!batches.length) return;
    setBusy(true);
    for (const b of batches) {
      await supabase.from("batch_produksi").update({
        status: "bikin", updated_by: user.id, status_updated_at: new Date().toISOString(), rendam_at: new Date().toISOString(),
      }).eq("id", b.id);
    }
    setAdonanForm((f) => ({ ...f, [bk]: {} }));
    setBusy(false);
    showToast("✓ Berhasil pindah ke Rendam");
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

  async function resetAllAdonan() {
    const adonanBatches = active.filter((b) => b.status === "adonan");
    if (adonanBatches.length === 0) {
      alert("Tidak ada batch Adonan yang perlu direset.");
      return;
    }
    if (!confirm(`Reset ${adonanBatches.length} batch Adonan?\n\nSemua batch Adonan akan dihapus dan stok bahan baku akan dikembalikan.`)) return;
    setBusy(true);
    for (const b of adonanBatches) {
      await restoreIngredients(b.id, b.tanggal_produksi);
      await supabase.from("batch_produksi").delete().eq("id", b.id);
    }
    setAdonanForm((f) => ({ ...f, cane: {}, mehana: {} }));
    setBusy(false);
    fetchData();
  }

  async function undoSavedAdonan(bk: BrandKey) {
    const batches = adonanBatchesForBrand(bk);
    if (!batches.length) return;
    if (!confirm("Yakin batalkan simpan adonan?\nStok bahan baku akan di-restore.")) return;
    setBusy(true);
    for (const b of batches) {
      await restoreIngredients(b.id, b.tanggal_produksi);
      await supabase.from("batch_produksi").delete().eq("id", b.id);
    }
    setBusy(false);
    fetchData();
  }

  // ── STAGE 2: Rendam → Undo ke Adonan (status only) ──────────
  async function undoRendam(batch: Batch) {
    if (!confirm(`Kembalikan ${batch.produk_sku?.varian} ke Adonan?`)) return;
    setBusy(true);
    await supabase.from("batch_produksi").update({ status: "adonan", updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }

  // ── STAGE 2 → 3: Rendam → Packing & Freezer (modal input pcs) ──
  function openPacking(batch: Batch) {
    setPackingForm({ pcs: "", catatan: "" });
    setPackingModal({ batch });
  }
  async function confirmPacking() {
    if (!user || !packingModal) return;
    const { batch } = packingModal;
    const cfg = findVarian(batch);
    const standar = cfg ? Math.round(batch.jumlah_pack_rencana * cfg.pcs_per_kg) : 0;
    const lebihan = parseInt(packingForm.pcs) || 0;
    const actualPcs = standar + lebihan;
    if (actualPcs <= 0) return;
    setBusy(true);
    try {
      await applyRendam(batch, actualPcs);                  // kurangi bahan rendam (margarine dll) sesuai actual pcs
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memotong stok bahan rendam — cek Bahan Baku manual.");
    }
    await supabase.from("batch_produksi").update({
      status: "packing", jumlah_pack_adonan: actualPcs,
      catatan_reject: packingForm.catatan || null, updated_by: user.id, status_updated_at: new Date().toISOString(),
    }).eq("id", batch.id);
    setBusy(false);
    setPackingModal(null);
    fetchData();
  }
  async function undoPacking(batch: Batch) {
    if (!confirm(`Kembalikan ${batch.produk_sku?.varian} ke Rendam?\nStok bahan rendam akan dikembalikan.`)) return;
    setBusy(true);
    await restoreRendam(batch);
    await supabase.from("batch_produksi").update({ status: "bikin", jumlah_pack_adonan: null, updated_by: user!.id, status_updated_at: new Date().toISOString() }).eq("id", batch.id);
    setBusy(false);
    fetchData();
  }
  // ── STAGE 3 → Selesai: Input Stok (pack/reject/lebihan) ─────
  // Carry-over lebihan: ambil lebihan dari input stok terakhir varian yang sama
  function carryInFor(brand: string, varian: string): { pcs: number; date: string | null } {
    const row = packingInputs.find((p) => p.brand === brand && p.varian === varian);
    if (!row) return { pcs: 0, date: null };
    // lebihan disimpan sebagai raw (dari form); carry-over besok = sisa setelah gabungkan
    const totalLeb = (row.carry_in ?? 0) + row.lebihan;
    const pcs = totalLeb >= 5 ? totalLeb % 5 : totalLeb;
    return { pcs, date: row.tanggal };
  }

  function openInputStok(batch: Batch) {
    const cfg = findVarian(batch);
    if (!cfg) return;
    const { pcs, date } = carryInFor(cfg.brandKey, cfg.varianDB);
    setInputStokModal({ batch, carryIn: pcs, carryFromDate: date });
  }

  async function confirmInputStok(data: { pack5: number; pack5Final: number; pack10: number; reject: number; rejectLain: number; alasanRejectLain: string; lebihan: number; catatan: string }) {
    if (!user || !inputStokModal) return;
    const { batch, carryIn } = inputStokModal;
    const cfg = findVarian(batch);
    if (!cfg) return;
    const direndam = batch.jumlah_pack_adonan ?? 0;
    // pack5 = original dari form (untuk rekap); pack5Final = termasuk gabungkan carry-over
    const packPcs = data.pack5Final * 5 + data.pack10 * 10;

    // Total aktual fisik (raw) = (pack×isi) + reject + basi/hilang + lebihan
    const totalAktual = data.pack5 * 5 + data.pack10 * 10 + data.reject + data.rejectLain + data.lebihan;
    const selisihPcs  = totalAktual - direndam;   // + aktual lebih, − aktual kurang
    // Aktual KURANG dari rendam → deficit otomatis masuk Reject Packing
    const deficit     = selisihPcs < 0 ? -selisihPcs : 0;
    const rejectSaved = data.reject + deficit;

    setBusy(true);
    try {
      // 1. simpan record: pack5 & lebihan = nilai ORIGINAL dari form (raw)
      const { error: insertErr } = await supabase.from("packing_input").insert({
        batch_produksi_id: batch.id, produk_sku_id: batch.produk_sku_id,
        brand: cfg.brandKey, varian: cfg.varianDB, tanggal: batch.tanggal_produksi,
        total_direndam: direndam, carry_in: carryIn, total_available: direndam,
        pack5: data.pack5, pack10: data.pack10, reject: rejectSaved,
        reject_lain: data.rejectLain, alasan_reject_lain: data.rejectLain > 0 ? (data.alasanRejectLain || null) : null,
        lebihan: data.lebihan, catatan: data.catatan || null, created_by: user.id,
      });
      if (insertErr) throw new Error(insertErr.message);

      // 2. stok produk jadi pakai pack5Final (termasuk pack dari gabungkan carry-over)
      if (cfg.brandKey === "mehana") {
        const sku5  = skuList.find((s) => s.brand === "mehana" && s.varian === cfg.varianDB && s.isi_per_pack === 5);
        const sku10 = skuList.find((s) => s.brand === "mehana" && s.varian === cfg.varianDB && s.isi_per_pack === 10);
        if (data.pack5Final > 0 && sku5)  await adjustProdukJadi(sku5.id,  data.pack5Final);
        if (data.pack10     > 0 && sku10) await adjustProdukJadi(sku10.id, data.pack10);
      } else {
        if (data.pack5Final > 0) await adjustProdukJadi(batch.produk_sku_id, data.pack5Final);
      }

      // 2b. reject packing (+ deficit otomatis) → masuk stok produk reject (pcs)
      if (rejectSaved > 0) await adjustStokReject(cfg.brandKey, cfg.varianDB, rejectSaved);

      // 2c. KOREKSI bahan baku + catat selisih untuk review Super Admin
      if (selisihPcs !== 0) {
        await applyKoreksiBahan(batch, selisihPcs);
        await recordSelisihPacking(batch, direndam, totalAktual, selisihPcs, data.catatan);
      }

      // 3. batch → selesai
      const { error: updateErr } = await supabase.from("batch_produksi").update({
        status: "selesai", jumlah_pack_packing: packPcs, jumlah_reject: rejectSaved,
        jumlah_reject_lain: data.rejectLain,
        catatan_reject: data.catatan || null, updated_by: user.id, status_updated_at: new Date().toISOString(),
      }).eq("id", batch.id);
      if (updateErr) throw new Error(updateErr.message);

      // 4. Poin otomatis reject basi → semua karyawan yang shift di tanggal produksi +0.5
      if (data.rejectLain > 0 && data.alasanRejectLain === "basi") {
        await applyPoinRejectBasi(batch.tanggal_produksi);
      }

      setInputStokModal(null);
      showToast("✓ Stok berhasil diinput");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      showToast(`❌ Gagal: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Hapus riwayat + restore semua data terkait ──────────────
  async function deleteRiwayat(batch: Batch) {
    if (!user) return;
    setBusy(true);
    setDeleteConfirm(null);
    try {
      // 1. Selalu restore bahan baku adonan (penggunaan_bahan)
      await restoreIngredients(batch.id, batch.tanggal_produksi);

      // 2. Jika sudah melewati stage Rendam → restore bahan rendam
      if (batch.status === "packing" || batch.status === "freezer" || batch.status === "selesai") {
        await restoreRendam(batch);
      }

      // 3. Jika sudah selesai (Input Stok dikonfirmasi) → restore stok produk jadi
      if (batch.status === "selesai") {
        const cfg = findVarian(batch);
        // Ambil data pack5/pack10/carry_in/lebihan dari packing_input
        const { data: piRows } = await supabase
          .from("packing_input")
          .select("pack5, pack10, carry_in, lebihan, reject, brand, varian")
          .eq("batch_produksi_id", batch.id);
        for (const pi of (piRows as { pack5: number; pack10: number; carry_in: number; lebihan: number; reject: number; brand: string; varian: string }[] | null) ?? []) {
          // pack5 simpan nilai original; pack5Final = + extra dari gabungkan carry-over
          const totalLeb  = (pi.carry_in ?? 0) + pi.lebihan;
          const extraPack = totalLeb >= 5 ? Math.floor(totalLeb / 5) : 0;
          const pack5Final = pi.pack5 + extraPack;
          if (pi.brand === "mehana") {
            const sku5  = skuList.find((s) => s.brand === "mehana" && s.varian === pi.varian && s.isi_per_pack === 5);
            const sku10 = skuList.find((s) => s.brand === "mehana" && s.varian === pi.varian && s.isi_per_pack === 10);
            if (pack5Final > 0 && sku5)  await adjustProdukJadi(sku5.id,  -pack5Final);
            if (pi.pack10 > 0 && sku10) await adjustProdukJadi(sku10.id, -pi.pack10);
          } else {
            if (pack5Final > 0) await adjustProdukJadi(batch.produk_sku_id, -pack5Final);
          }
          // restore stok produk reject (reject packing)
          if ((pi.reject ?? 0) > 0) await adjustStokReject(pi.brand, pi.varian, -pi.reject);
        }
        // Hapus packing_input rows terkait batch ini
        await supabase.from("packing_input").delete().eq("batch_produksi_id", batch.id);
        // Hapus catatan selisih packing terkait batch ini
        await supabase.from("selisih_packing").delete().eq("batch_packing_id", batch.id);
        void cfg; // used above via batch.produk_sku_id
      }

      // 4. Hapus batch
      await supabase.from("batch_produksi").delete().eq("id", batch.id);

      showToast("✓ Riwayat berhasil dihapus & data di-restore");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      showToast(`❌ Gagal hapus: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // ── [TEMP] Reset semua alur produksi (untuk testing) ─────────
  async function resetAllProduction() {
    if (!user || !canAccessAdmin(user.role)) return;
    if (!confirm(
      "⚠️ RESET SEMUA ALUR PRODUKSI?\n\n" +
      "Semua batch (Adonan, Rendam, Packing & Freezer, Selesai) akan dihapus.\n" +
      "Stok bahan baku & produk jadi akan di-restore otomatis.\n\n" +
      "Yakin lanjutkan?"
    )) return;
    setBusy(true);
    try {
      for (const batch of allBatches) {
        // Restore stok produk jadi (hanya untuk batch selesai)
        if (batch.status === "selesai") {
          const { data: piRows } = await supabase
            .from("packing_input")
            .select("pack5, pack10, carry_in, lebihan, reject, brand, varian")
            .eq("batch_produksi_id", batch.id);
          for (const pi of (piRows as { pack5: number; pack10: number; carry_in: number; lebihan: number; reject: number; brand: string; varian: string }[] | null) ?? []) {
            const totalLeb   = (pi.carry_in ?? 0) + pi.lebihan;
            const extraPack  = totalLeb >= 5 ? Math.floor(totalLeb / 5) : 0;
            const pack5Final = pi.pack5 + extraPack;
            if (pi.brand === "mehana") {
              const sku5  = skuList.find((s) => s.brand === "mehana" && s.varian === pi.varian && s.isi_per_pack === 5);
              const sku10 = skuList.find((s) => s.brand === "mehana" && s.varian === pi.varian && s.isi_per_pack === 10);
              if (pack5Final > 0 && sku5)  await adjustProdukJadi(sku5.id, -pack5Final);
              if (pi.pack10  > 0 && sku10) await adjustProdukJadi(sku10.id, -pi.pack10);
            } else {
              if (pack5Final > 0) await adjustProdukJadi(batch.produk_sku_id, -pack5Final);
            }
            if ((pi.reject ?? 0) > 0) await adjustStokReject(pi.brand, pi.varian, -pi.reject);
          }
        }
        // Restore bahan rendam (untuk batch yg sudah melewati Rendam)
        if (batch.status === "packing" || batch.status === "freezer" || batch.status === "selesai") {
          await restoreRendam(batch);
        }
        // Restore bahan adonan (semua batch)
        await restoreIngredients(batch.id, batch.tanggal_produksi);
      }
      // Hapus semua packing_input, selisih_packing, dan batch_produksi
      await supabase.from("packing_input").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("selisih_packing").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("batch_produksi").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      setAdonanForm((f) => ({ ...f, cane: {}, mehana: {} }));
      setActiveTab("adonan");
      showToast("✓ Reset selesai — alur produksi kembali ke awal");
      fetchData();
    } catch (err) {
      showToast(`❌ Gagal reset: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Riwayat range ───────────────────────────────────────────
  // Semua tanggal dihitung dalam WIB (Asia/Jakarta), real-time dari new Date()
  const { start: rStart, end: rEnd } = getRiwayatRange(preset, customStart, customEnd, selectedBulan);
  // tanggal_produksi adalah DATE string (YYYY-MM-DD); perbandingan string ISO aman
  const riwayat = allBatches.filter((b) => b.tanggal_produksi >= rStart && b.tanggal_produksi <= rEnd);

  // ── Render ──────────────────────────────────────────────────
  // Sub-tab (stage) yang boleh diakses sesuai capability
  const stageAllowed = (s: Stage): boolean =>
    s === "adonan" ? caps.adonan :
    s === "bikin"  ? caps.rendam :
    s === "packing" ? caps.packingFreezer : false;
  const allowedStages = STAGES.filter(stageAllowed);

  const tabActiveColor = (s: Stage | "riwayat") =>
    s === "adonan" ? "bg-yellow-100 text-yellow-800" :
    s === "bikin"  ? "bg-orange-100 text-orange-800" :
    s === "packing"? "bg-blue-100 text-blue-800" :
                     "bg-gray-800 text-white";

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">

      {/* Toast notifikasi sukses */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-green-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Top-level tab switcher: Bahan Baku | Alur Produksi.
          Hanya ditampilkan kalau user punya akses ke KEDUA bagian.
          Guard mounted agar server/client HTML identik (tidak ada mismatch hydration). */}
      {mounted && caps.bahanBaku && caps.produksiFlow && (
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
          <button onClick={() => setTopTab("bahan")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              topTab === "bahan" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}>
            Bahan Baku
          </button>
          <button onClick={() => setTopTab("packing")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              topTab === "packing" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}>
            Alur Produksi
          </button>
        </div>
      )}

      {topTab === "bahan" && mounted && caps.bahanBaku && <BahanBakuView />}

      {topTab === "packing" && mounted && caps.produksiFlow && (<>

      {/* Header + counter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">Alur Produksi</h1>
        <div className="flex items-center flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <span key={s} className={statusClass[s]}>{statusLabel[s]}: {countFor(s)}</span>
          ))}
          {user && canAccessAdmin(user.role) && (
            <button
              onClick={resetAllProduction}
              disabled={busy || allBatches.length === 0}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40 transition-colors"
              title="Reset semua alur produksi (temporary)"
            >
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Tabs — difilter sesuai capability */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {allowedStages.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <button onClick={() => setActiveTab(s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${activeTab === s ? tabActiveColor(s) + " font-semibold" : "text-gray-400 hover:bg-gray-100"}`}>
              <span>{stageIcon[s]}</span><span>{statusLabel[s]}</span>
              {countFor(s) > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === s ? "bg-white/70" : "bg-gray-200 text-gray-600"}`}>{countFor(s)}</span>
              )}
            </button>
            {i < allowedStages.length - 1 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
          </div>
        ))}
        {caps.produksiRiwayat && (
          <>
            <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />
            <button onClick={() => setActiveTab("riwayat")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 transition-all ${activeTab === "riwayat" ? "bg-gray-800 text-white font-semibold" : "text-gray-400 hover:bg-gray-100"}`}>
              <History size={14} /> Riwayat
            </button>
            <button onClick={() => setActiveTab("reject")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 transition-all ${activeTab === "reject" ? "bg-red-600 text-white font-semibold" : "text-gray-400 hover:bg-gray-100"}`}>
              <AlertTriangle size={14} /> Laporan Reject
            </button>
          </>
        )}
      </div>

      {/* ════════ TAB: ADONAN ════════ */}
      {activeTab === "adonan" && (
        <div className="space-y-4">
          {/* Reset button (admin only) */}
          {canAccessAdmin(user?.role ?? "") && countFor("adonan") > 0 && (
            <button onClick={resetAllAdonan} disabled={busy}
              className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 transition-colors disabled:opacity-40 w-full justify-center">
              <RotateCcw size={13} />
              Reset {countFor("adonan")} Batch Adonan &amp; Kembalikan Stok
            </button>
          )}

          {/* Tanggal */}
          <div className="card">
            <label className="label">Tanggal Produksi</label>
            <IndonesianDatePicker value={adonanForm.tanggal} onChange={(v) => setAdonanForm((f) => ({ ...f, tanggal: v }))} />
            {adonanForm.tanggal !== today && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Kamu input untuk tanggal <b>{formatTanggal(adonanForm.tanggal)}</b>, bukan hari ini ({formatTanggal(today)}). Yakin?
                </p>
              </div>
            )}
          </div>

          {/* Error stok */}
          {stockError.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-red-700 font-semibold text-sm">⚠ Stok bahan baku tidak cukup:</p>
              {stockError.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {/* Input cards per brand — 2 kolom sejajar di sm ke atas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {(Object.keys(BRANDS) as BrandKey[]).map((bk) => {
            const cfg    = BRANDS[bk];
            const kgMap  = bk === "cane" ? adonanForm.cane : adonanForm.mehana;
            const total  = Object.values(kgMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const amber  = cfg.color === "amber";
            // Derive from DB: saved = has adonan batches in DB for this brand
            const isSaved  = adonanBatchesForBrand(bk).length > 0;
            const isDone   = false; // transient only — no persistent "done" card needed
            const isLocked = isSaved;
            return (
              <div key={bk} className={`rounded-2xl border-2 p-4 transition-all ${
                isDone   ? "border-green-200 bg-green-50/40 opacity-70" :
                isSaved  ? (amber ? "border-amber-300 bg-amber-50/30" : "border-blue-300 bg-blue-50/30") :
                amber    ? "border-amber-200" : "border-blue-200"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isDone ? "bg-green-400" : amber ? "bg-amber-400" : "bg-blue-400"}`} />
                    <h2 className={`font-bold ${isDone ? "text-green-700" : amber ? "text-amber-700" : "text-blue-700"}`}>{cfg.label}</h2>
                  </div>
                  {isDone && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                      <CheckCircle size={12} /> Sudah pindah ke Rendam
                    </span>
                  )}
                  {isSaved && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                      <CheckCircle size={12} /> Adonan sudah disimpan
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {cfg.variants.map((v) => {
                    const has = parseFloat(kgMap[v.key] || "0") > 0;
                    const activeCls = amber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
                    return (
                      <div key={v.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${isLocked ? "bg-gray-50 border-gray-100" : has ? activeCls : "bg-white border-gray-200"}`}>
                        <span className={`text-sm font-semibold flex-1 min-w-0 ${isLocked ? "text-gray-400" : "text-gray-700"}`}>{v.label}</span>
                        <input type="number" step="0.1" min="0" placeholder="0"
                          className="input py-1.5 text-sm w-20 text-center disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                          disabled={isLocked}
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
                {!isDone && (
                  <div className="flex gap-2 mt-3">
                    {isSaved && (
                      <button onClick={() => undoSavedAdonan(bk)} disabled={busy}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-sm border-2 border-red-200 text-red-500 hover:bg-red-50 bg-white transition-all disabled:opacity-40 shrink-0">
                        <RotateCcw size={13} /> Undo
                      </button>
                    )}
                    <button onClick={() => submitAdonan(bk)}
                      disabled={submitting === bk || isSaved || total <= 0}
                      className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:cursor-not-allowed ${
                        isSaved
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : amber
                            ? "bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                            : "bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                      }`}>
                      {submitting === bk ? "Menyimpan..." : isSaved ? "✓ Tersimpan" : "Simpan Adonan"}
                    </button>
                    <button onClick={() => moveBrandToRendam(bk)}
                      disabled={!isSaved}
                      className={`flex-1 py-2.5 rounded-xl font-semibold text-sm border-2 transition-all disabled:cursor-not-allowed ${
                        isSaved
                          ? amber
                            ? "border-amber-400 text-amber-700 hover:bg-amber-50 bg-white"
                            : "border-blue-400 text-blue-700 hover:bg-blue-50 bg-white"
                          : "border-gray-200 text-gray-300 bg-white"
                      }`}>
                      Pindah ke Rendam →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          </div>

        </div>
      )}

      {/* ════════ TAB: RENDAM ════════ */}
      {activeTab === "bikin" && (
        <StageList
          title="Rendam"
          batches={active.filter((b) => b.status === "bikin")}
          renderActions={(b) => (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => openPacking(b)} disabled={busy} className="btn-primary flex-1 text-sm py-2">Pindah ke Packing &amp; Freezer</button>
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
          emphasizeDate
          batches={active.filter((b) => b.status === "packing" || b.status === "freezer")}
          renderActions={(b) => (
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => openInputStok(b)} disabled={busy} className="btn-primary flex-1 text-sm py-2">Input Stok</button>
              {/* Kembali ke Rendam hanya untuk Super Admin (testing); SPV packing tidak boleh */}
              {canAccessAdmin(user?.role ?? "") && (
                <button onClick={() => undoPacking(b)} disabled={busy}
                  className="flex items-center justify-center gap-1.5 flex-1 text-sm py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                  <ChevronLeft size={15} /> Kembali ke Rendam
                </button>
              )}
            </div>
          )}
        />
      )}

      {/* ════════ TAB: RIWAYAT ════════ */}
      {activeTab === "riwayat" && (
        <div className="space-y-3">
          <RiwayatFilter
            preset={preset} onPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            selectedBulan={selectedBulan} onBulan={setSelectedBulan}
            accentColor="amber"
          />

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <History size={16} className="text-amber-500" />
              <span className="font-semibold text-gray-700">Riwayat Produksi ({riwayat.length})</span>
            </div>
            {riwayat.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Tidak ada data pada rentang ini</p>
            ) : (
              <div className="space-y-3">
                {riwayat.map((b) => {
                  const sku = b.produk_sku as { nama_brand: string; varian: string; isi_per_pack: number };
                  const pi  = packingInputs.filter((p) => p.batch_produksi_id === b.id);
                  const row = pi[0] ?? null;
                  // pack5 = original dari form; pack5Final = + pack tambahan dari gabungkan
                  const rawCarryIn  = row?.carry_in  ?? 0;
                  const rawLebihan  = row?.lebihan   ?? 0;
                  const totalLeb    = rawCarryIn + rawLebihan;
                  const extraPack   = totalLeb >= 5 ? Math.floor(totalLeb / 5) : 0;
                  const carryOverBesok = totalLeb >= 5 ? totalLeb % 5 : totalLeb;
                  const pack5Orig   = row?.pack5  ?? 0;
                  const pack5Final  = pack5Orig + extraPack;
                  const totalPack10 = row?.pack10  ?? 0;
                  const totalReject = pi.reduce((s, p) => s + p.reject, 0);
                  const isMehana = row?.brand === "mehana";
                  const hasPackingData = pi.length > 0;
                  const isi5 = 5;
                  const isi10 = 10;
                  // Analisa selisih: dari selisih_packing (otoritatif) atau rekonstruksi
                  const selisihRow = selisihList.find((s) => s.batch_packing_id === b.id) ?? null;
                  const totalLain  = pi.reduce((s, p) => s + (p.reject_lain ?? 0), 0);
                  const p5pcs  = pack5Orig * isi5;
                  const p10pcs = totalPack10 * isi10;
                  const isExpanded = expandRiwayat === b.id;
                  return (
                    <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="font-semibold text-gray-800 text-sm">{sku?.nama_brand} — {sku?.varian}</p>
                          <p className="text-xs text-gray-400">{formatTanggal(b.tanggal_produksi)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                          {caps.isSuperAdmin && hasPackingData && (
                            <button onClick={() => setExpandRiwayat(isExpanded ? null : b.id)}
                              className={`p-1.5 rounded-lg transition-colors ${isExpanded ? "bg-amber-100 text-amber-600" : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"}`}
                              title="Lihat detail selisih">
                              <ChevronDown size={15} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </button>
                          )}
                          {caps.isSuperAdmin && (
                            <button onClick={() => setDeleteConfirm(b)} disabled={busy}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Chips: semua data dalam satu baris, scroll jika overflow */}
                      <div className="flex gap-1.5 text-xs mt-2 overflow-x-auto pb-0.5 scrollbar-hide">
                        <span className="shrink-0 bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-400">Adonan</span> <b className="text-gray-700">{formatAngka(b.jumlah_pack_rencana)} kg</b>
                        </span>
                        {b.jumlah_pack_adonan != null && (
                          <span className="shrink-0 bg-orange-50 rounded px-2 py-1">
                            <span className="text-orange-400">Direndam</span> <b className="text-orange-700">{formatAngka(b.jumlah_pack_adonan)} pcs</b>
                          </span>
                        )}
                        {hasPackingData && (
                          <>
                            <span className="shrink-0 bg-green-50 rounded px-2 py-1">
                              <span className="text-green-600">{sku?.varian}{isMehana ? " Isi 5" : ""}</span>
                              <span className="text-green-400 mx-1">|</span>
                              <b className="text-green-700">{formatAngka(pack5Final)} pack</b>
                            </span>
                            {isMehana && totalPack10 > 0 && (
                              <span className="shrink-0 bg-green-50 rounded px-2 py-1">
                                <span className="text-green-600">{sku?.varian} Isi 10</span>
                                <span className="text-green-400 mx-1">|</span>
                                <b className="text-green-700">{formatAngka(totalPack10)} pack</b>
                              </span>
                            )}
                            <span className="shrink-0 bg-red-50 rounded px-2 py-1">
                              <span className="text-red-400">Reject</span> <b className="text-red-700">{formatAngka(totalReject)} pcs</b>
                            </span>
                            <span className="shrink-0 bg-amber-50 rounded px-2 py-1">
                              <span className="text-amber-500">Lebihan</span> <b className="text-amber-700">{formatAngka(rawLebihan)} pcs</b>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-xs text-gray-400">Adonan · <span className="font-medium text-gray-500">{(b.users as { nama: string })?.nama ?? "—"}</span> · {formatTanggalWaktu(b.created_at)}</p>
                        {b.rendam_at && (
                          <p className="text-xs text-gray-400">Rendam · <span className="font-medium text-gray-500">{(b.users as { nama: string })?.nama ?? "—"}</span> · {formatTanggalWaktu(b.rendam_at)}</p>
                        )}
                        {hasPackingData && row && (
                          <p className="text-xs text-gray-400">Packing · <span className="font-medium text-gray-500">{row.users?.nama ?? "—"}</span> · {formatTanggalWaktu(row.created_at)}</p>
                        )}
                      </div>

                      {/* Detail selisih (Super Admin) */}
                      {isExpanded && hasPackingData && (() => {
                        const direndam = selisihRow?.total_direndam ?? b.jumlah_pack_adonan ?? 0;
                        const aktual   = selisihRow?.total_aktual ?? (p5pcs + p10pcs + totalReject + totalLain + rawLebihan);
                        const selisih  = selisihRow?.selisih_pcs ?? (aktual - direndam);
                        const catatan  = selisihRow?.catatan ?? row?.catatan ?? null;
                        // Kumpulkan alasan basi/hilang/dll dari semua packing_input batch ini
                        const alasanLain = Array.from(new Set(
                          pi.filter((p) => (p.reject_lain ?? 0) > 0 && p.alasan_reject_lain)
                            .map((p) => p.alasan_reject_lain as string)
                        ));
                        const DetRow = ({ label, val, sub }: { label: string; val: string; sub?: string }) => (
                          <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                            <span className="text-gray-500">{label}{sub && <span className="text-gray-300"> {sub}</span>}</span>
                            <span className="font-semibold text-gray-700 tabular-nums">{val}</span>
                          </div>
                        );
                        return (
                          <div className="mt-2.5 rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-xs space-y-3">
                            <div>
                              <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Rincian Hasil</p>
                              <DetRow label={isMehana ? "Pack Isi 5" : "Pack"} sub={`(${formatAngka(pack5Orig)} × 5)`} val={`${formatAngka(p5pcs)} pcs`} />
                              {isMehana && totalPack10 > 0 && <DetRow label={`Pack Isi 10`} sub={`(${formatAngka(totalPack10)} × 10)`} val={`${formatAngka(p10pcs)} pcs`} />}
                              <DetRow label="Reject Packing" sub="(termasuk kekurangan)" val={`${formatAngka(totalReject)} pcs`} />
                              {totalLain > 0 && <DetRow label="Basi / Hilang / dll" sub={alasanLain.length > 0 ? `(${alasanLain.join(", ")})` : undefined} val={`${formatAngka(totalLain)} pcs`} />}
                              <DetRow label="Lebihan" val={`${formatAngka(rawLebihan)} pcs`} />
                            </div>

                            <div className="pt-1">
                              <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Analisa Selisih</p>
                              <DetRow label="Total Direndam" val={`${formatAngka(direndam)} pcs`} />
                              <DetRow label="Total Aktual (fisik)" val={`${formatAngka(aktual)} pcs`} />
                              <div className="flex items-center justify-between pt-1.5">
                                <span className="text-gray-500">Selisih</span>
                                {selisih === 0 ? (
                                  <span className="font-bold text-green-600">Sesuai ✓</span>
                                ) : selisih > 0 ? (
                                  <span className="font-bold text-blue-600">Adonan LEBIH +{formatAngka(selisih)} pcs</span>
                                ) : (
                                  <span className="font-bold text-red-600">Adonan KURANG {formatAngka(selisih)} pcs</span>
                                )}
                              </div>
                              {selisih !== 0 && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {selisih > 0
                                    ? "Aktual fisik lebih banyak dari yang direndam — bahan baku dikoreksi (dikurangi lagi otomatis)."
                                    : "Aktual fisik kurang dari yang direndam — kekurangan otomatis masuk Reject & bahan dikembalikan."}
                                </p>
                              )}
                            </div>

                            {catatan && (
                              <div className="pt-1 border-t border-gray-100">
                                <p className="font-bold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Catatan PIC</p>
                                <p className="text-gray-600 italic">&ldquo;{catatan}&rdquo;</p>
                              </div>
                            )}
                            {selisihRow && (
                              <p className="text-[10px] text-gray-400">
                                Diinput oleh <span className="font-medium text-gray-500">{selisihRow.nama_user}</span>
                                {selisihRow.status_review === "reviewed" && <span className="text-green-500"> · sudah direview</span>}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ TAB: LAPORAN REJECT ════════ */}
      {activeTab === "reject" && (
        <div className="space-y-3">
          <RiwayatFilter
            preset={preset} onPreset={setPreset}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            selectedBulan={selectedBulan} onBulan={setSelectedBulan}
            accentColor="red"
          />

          {/* Toggle view */}
          <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
            {([["semua","Semua"],["reject","Reject"],["lain","Basi / Hilang / dll"]] as const).map(([key, lbl]) => (
              <button key={key} onClick={() => setRejectView(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${rejectView === key ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {(() => {
            const rows = packingInputs.filter((p) => p.tanggal >= rStart && p.tanggal <= rEnd);
            const totalReject = rows.reduce((s, p) => s + p.reject, 0);
            const totalLain   = rows.reduce((s, p) => s + (p.reject_lain ?? 0), 0);
            const totalSemua  = totalReject + totalLain;

            // Per-varian summary
            const ordered: { brandLabel: string; varianLabel: string; reject: number; lain: number; count: number }[] = [];
            (Object.keys(BRANDS) as BrandKey[]).forEach((bk) => {
              const cfg = BRANDS[bk];
              cfg.variants.forEach((v) => {
                const matching = rows.filter((p) => p.brand === bk && p.varian === v.varianDB);
                const rej  = matching.reduce((s, p) => s + p.reject, 0);
                const lain = matching.reduce((s, p) => s + (p.reject_lain ?? 0), 0);
                if (rej + lain > 0) ordered.push({ brandLabel: cfg.label, varianLabel: v.label, reject: rej, lain, count: matching.length });
              });
            });

            // Alasan breakdown (untuk view "lain")
            const alasanGroup: Record<string, number> = {};
            rows.forEach((p) => {
              if ((p.reject_lain ?? 0) > 0 && p.alasan_reject_lain) {
                alasanGroup[p.alasan_reject_lain] = (alasanGroup[p.alasan_reject_lain] ?? 0) + (p.reject_lain ?? 0);
              }
            });

            const displayTotal = rejectView === "semua" ? totalSemua : rejectView === "reject" ? totalReject : totalLain;

            return (
              <>
                {/* Summary card */}
                <div className="bg-gray-900 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wide">
                      {rejectView === "semua" ? "Total Semua Reject" : rejectView === "reject" ? "Total Reject (Packing)" : "Total Basi/Hilang/dll"}
                    </span>
                    <span className="text-lg font-bold text-white">{formatAngka(displayTotal)} pcs</span>
                  </div>
                  {rejectView === "semua" && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      <span>Reject packing: <b className="text-red-300">{formatAngka(totalReject)}</b></span>
                      <span>Basi/Hilang/dll: <b className="text-orange-300">{formatAngka(totalLain)}</b></span>
                    </div>
                  )}
                </div>

                {/* Per-varian */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="font-semibold text-gray-700">
                      {rejectView === "lain" ? "Basi/Hilang/dll per Alasan" : "Reject per Varian"}
                    </span>
                  </div>

                  {rejectView === "lain" ? (
                    Object.keys(alasanGroup).length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-6">Tidak ada data pada rentang ini</p>
                    ) : (
                      <div className="space-y-2">
                        {ALASAN_REJECT_LAIN.map((a) => {
                          const total = alasanGroup[a.key] ?? 0;
                          if (!total) return null;
                          return (
                            <div key={a.key} className="flex items-center justify-between border-b border-gray-50 pb-2">
                              <p className="text-sm font-medium text-gray-800">{a.label}</p>
                              <span className="text-sm font-bold text-orange-600">{formatAngka(total)} pcs</span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : ordered.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">Tidak ada data pada rentang ini</p>
                  ) : (
                    <div className="space-y-2">
                      {ordered.map((r, i) => {
                        const val = rejectView === "reject" ? r.reject : r.reject + r.lain;
                        if (val === 0) return null;
                        return (
                          <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-2">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{r.varianLabel}</p>
                              <p className="text-xs text-gray-400">{r.brandLabel} · {r.count}× input
                                {rejectView === "semua" && r.reject > 0 && r.lain > 0 && (
                                  <span> · reject: {r.reject} + basi/dll: {r.lain}</span>
                                )}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-red-600">{formatAngka(val)} pcs</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Detail input */}
                {rows.length > 0 && (
                  <div className="card">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detail Input</p>
                    <div className="space-y-1.5">
                      {rows.map((p) => {
                        const cfg = BRANDS[p.brand as BrandKey];
                        const vlabel = cfg?.variants.find((v) => v.varianDB === p.varian)?.label ?? p.varian;
                        const rej  = p.reject ?? 0;
                        const lain = p.reject_lain ?? 0;
                        const alasan = p.alasan_reject_lain ? ALASAN_REJECT_LAIN.find((a) => a.key === p.alasan_reject_lain)?.label : null;
                        const showRow = rejectView === "semua" ? (rej + lain > 0) : rejectView === "reject" ? rej > 0 : lain > 0;
                        if (!showRow) return null;
                        return (
                          <div key={p.id} className="border-b border-gray-50 pb-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 pr-2">
                                <span className="font-medium text-gray-700">{cfg?.label} — {vlabel}</span>
                                <span className="text-gray-400"> · {formatTanggal(p.tanggal)}</span>
                              </div>
                              <div className="shrink-0 text-right">
                                {(rejectView === "semua" || rejectView === "reject") && rej > 0 && (
                                  <span className="text-red-600 font-semibold block">Reject: {formatAngka(rej)} pcs</span>
                                )}
                                {(rejectView === "semua" || rejectView === "lain") && lain > 0 && (
                                  <span className="text-orange-600 font-semibold block">{alasan ?? "Basi/dll"}: {formatAngka(lain)} pcs</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ════════ MODAL: PACKING & FREEZER ════════ */}
      {packingModal && (() => {
        const batch = packingModal.batch;
        const cfg = findVarian(batch);
        const kg = batch.jumlah_pack_rencana;
        const standar = cfg ? Math.round(kg * cfg.pcs_per_kg) : 0;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
                <h2 className="font-bold text-gray-800">Pindah ke Packing &amp; Freezer</h2>
                <button onClick={() => setPackingModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="font-medium text-gray-800">{batch.produk_sku?.nama_brand} — {batch.produk_sku?.varian}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className={statusClass.bikin}>Rendam</span> {" → "} <span className={statusClass.packing}>Packing &amp; Freezer</span>
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
                    <p className="text-xs text-amber-500">{cfg.pcs_per_kg} pcs/kg × {formatAngka(kg)} kg</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="label">Total Jumlah Direndam (Actual)</label>

                  {/* Standar — read only */}
                  <div className="flex items-center gap-2">
                    <div className="input flex-1 text-lg font-semibold bg-gray-50 text-gray-400 cursor-default select-none">
                      {standar}
                    </div>
                    <span className="text-sm font-semibold text-gray-400 shrink-0 w-16">Standar</span>
                  </div>

                  {/* Lebihan di luar standar */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" placeholder="0"
                      className="input flex-1 text-lg font-semibold"
                      value={packingForm.pcs}
                      onChange={(e) => setPackingForm((f) => ({ ...f, pcs: e.target.value }))}
                    />
                    <span className="text-sm font-semibold text-gray-500 shrink-0 w-16">Lebihan</span>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5 border border-orange-100">
                    <span className="text-sm font-semibold text-orange-700">Total Direndam</span>
                    <span className="text-xl font-bold text-orange-700">
                      {standar + (parseInt(packingForm.pcs) || 0)} pcs
                    </span>
                  </div>
                </div>

                <div>
                  <label className="label">Catatan <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea rows={2} className="input resize-none" placeholder="Catatan tambahan..."
                    value={packingForm.catatan} onChange={(e) => setPackingForm((f) => ({ ...f, catatan: e.target.value }))} />
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setPackingModal(null)} className="btn-secondary flex-1">Batal</button>
                  <button onClick={confirmPacking} disabled={busy || standar <= 0}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> {busy ? "Memproses..." : "Konfirmasi"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════ MODAL: INPUT STOK ════════ */}
      {inputStokModal && (
        <InputStokModal
          batch={inputStokModal.batch}
          carryIn={inputStokModal.carryIn}
          carryFromDate={inputStokModal.carryFromDate}
          cfg={findVarian(inputStokModal.batch)}
          busy={busy}
          onClose={() => setInputStokModal(null)}
          onConfirm={confirmInputStok}
        />
      )}

      {/* ── Modal konfirmasi hapus riwayat ── */}
      {deleteConfirm && (() => {
        const b = deleteConfirm;
        const sku = b.produk_sku as { nama_brand: string; varian: string };
        const stageLabel: Record<string, string> = { adonan: "Adonan", bikin: "Rendam", packing: "Packing & Freezer", freezer: "Packing & Freezer", selesai: "Selesai" };
        const restoreNotes: Record<string, string> = {
          adonan: "Stok bahan baku akan di-restore.",
          bikin:  "Stok bahan baku & bahan rendam akan di-restore.",
          packing: "Stok bahan baku & bahan rendam akan di-restore.",
          freezer: "Stok bahan baku & bahan rendam akan di-restore.",
          selesai: "Stok bahan baku, bahan rendam & stok produk jadi akan di-restore.",
        };
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-800">Hapus Riwayat?</p>
                  <p className="text-xs text-gray-400">Stage: {stageLabel[b.status]}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <p className="text-sm font-semibold text-gray-800">{sku?.nama_brand} — {sku?.varian}</p>
                <p className="text-xs text-gray-500">{formatTanggal(b.tanggal_produksi)} · {formatAngka(b.jumlah_pack_rencana)} kg adonan</p>
              </div>
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                ⚠ {restoreNotes[b.status]}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={() => deleteRiwayat(b)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {busy ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </>)}
    </div>
  );
}

// ── InputStokModal: input pack/reject/lebihan + validasi ──────
function InputStokModal({ batch, carryIn, carryFromDate, cfg, busy, onClose, onConfirm }: {
  batch: Batch;
  carryIn: number;
  carryFromDate: string | null;
  cfg: (VarianCfg & { brandKey: BrandKey; brandLabel: string }) | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (data: { pack5: number; pack5Final: number; pack10: number; reject: number; rejectLain: number; alasanRejectLain: string; lebihan: number; catatan: string }) => void;
}) {
  const [pack5,            setPack5]            = useState("");
  const [pack10,           setPack10]           = useState("");
  const [reject,           setReject]           = useState("");
  const [rejectLain,       setRejectLain]       = useState("");
  const [alasanRejectLain, setAlasanRejectLain] = useState("basi");
  const [lebihan,          setLebihan]          = useState("");
  const [catatan,          setCatatan]          = useState("");
  const [stage,            setStage]            = useState<"input" | "akumulasi">("input");
  const [sudahGabung,      setSudahGabung]      = useState(false);

  const showPack10 = cfg?.brandKey === "mehana";
  const locked     = stage === "akumulasi";

  const direndam = batch.jumlah_pack_adonan ?? 0;
  const p5   = parseInt(pack5)       || 0;
  const p10  = showPack10 ? (parseInt(pack10) || 0) : 0;
  const rej  = parseInt(reject)      || 0;
  const rejL = parseInt(rejectLain)  || 0;
  const leb  = parseInt(lebihan)     || 0;

  // Total aktual fisik vs total direndam
  const sum           = p5 * 5 + p10 * 10 + rej + rejL + leb;   // = total aktual
  const selisihAktual = sum - direndam;                          // + lebih, − kurang, 0 pas
  const adaSelisih    = selisihAktual !== 0;
  const catatanOk     = !adaSelisih || catatan.trim().length > 0;
  const bolehSubmit   = sum > 0 && catatanOk;

  // Preview koreksi bahan baku (dari resep rendam: gr/kg ÷ pcs/kg × selisih)
  const koreksiBahan = (cfg?.rendam ?? []).map((b) => ({
    nama: b.nama,
    gr: Math.abs(selisihAktual) * (b.gr / (cfg?.pcs_per_kg || 1)),
  }));

  // Stage 2: Akumulasi
  const totalLebihan  = carryIn + leb;
  const bisaGabung    = totalLebihan >= 5;
  const extraPack     = Math.floor(totalLebihan / 5);
  const carryOverBesok = sudahGabung ? totalLebihan % 5 : totalLebihan;
  const pack5Final    = p5 + (sudahGabung ? extraPack : 0);

  const inputCls = `input py-1.5 text-sm text-center ${locked ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-800">Input Stok — Packing &amp; Freezer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">

          {/* ── Header info ── */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
            <p className="font-semibold text-gray-800">{batch.produk_sku?.nama_brand} — {batch.produk_sku?.varian}</p>
            <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2 py-1 text-xs">
              <CalendarDays size={12} className="text-blue-500 shrink-0" />
              <span className="text-blue-600">Masuk Tanggal Produksi: <b className="text-blue-700">{formatTanggal(batch.tanggal_produksi)}</b></span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total Direndam</span>
              <span className="font-semibold text-gray-800">{formatAngka(direndam)} pcs</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold border-t border-gray-200 pt-1.5">
              <span className="text-gray-700">Total Available</span>
              <span className="text-gray-900">{formatAngka(direndam)} pcs</span>
            </div>
          </div>

          {/* ── TAHAP 1: Input Produksi ── */}
          <div className="space-y-4">
            {/* Pack inputs */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pack</p>
              <div className="flex items-center gap-2">
                <span className={`text-sm w-24 shrink-0 ${locked ? "text-gray-400" : "text-gray-600"}`}>Isi 5 Pcs</span>
                <input type="number" min="0" placeholder="0" className={`${inputCls} w-20`}
                  value={pack5} onChange={(e) => setPack5(e.target.value)} disabled={locked} />
                <span className="text-xs text-gray-400">pack</span>
                <span className={`text-sm font-semibold ml-auto ${locked ? "text-gray-400" : "text-gray-700"}`}>= {formatAngka(p5 * 5)} pcs</span>
              </div>
              {showPack10 && (
                <div className="flex items-center gap-2">
                  <span className={`text-sm w-24 shrink-0 ${locked ? "text-gray-400" : "text-gray-600"}`}>Isi 10 Pcs</span>
                  <input type="number" min="0" placeholder="0" className={`${inputCls} w-20`}
                    value={pack10} onChange={(e) => setPack10(e.target.value)} disabled={locked} />
                  <span className="text-xs text-gray-400">pack</span>
                  <span className={`text-sm font-semibold ml-auto ${locked ? "text-gray-400" : "text-gray-700"}`}>= {formatAngka(p10 * 10)} pcs</span>
                </div>
              )}
            </div>

            {/* Reject, Basi/Hilang/dll & Lebihan */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Reject & Lainnya</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`label ${locked ? "text-gray-400" : ""}`}>Reject</label>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" placeholder="0" className={`${inputCls} flex-1`}
                      value={reject} onChange={(e) => setReject(e.target.value)} disabled={locked} />
                    <span className="text-xs text-gray-400">pcs</span>
                  </div>
                </div>
                <div>
                  <label className={`label ${locked ? "text-gray-400" : ""}`}>Lebihan</label>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" placeholder="0" className={`${inputCls} flex-1`}
                      value={lebihan} onChange={(e) => setLebihan(e.target.value)} disabled={locked} />
                    <span className="text-xs text-gray-400">pcs</span>
                  </div>
                </div>
              </div>
              {/* Basi/Hilang/Salah Resep/dll */}
              <div className={`rounded-xl border p-3 space-y-2 ${locked ? "opacity-50" : "border-orange-200 bg-orange-50"}`}>
                <p className="text-xs font-semibold text-orange-700">Basi / Hilang / Salah Resep / dll</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" placeholder="0" className={`${inputCls} w-20`}
                    value={rejectLain} onChange={(e) => setRejectLain(e.target.value)} disabled={locked} />
                  <span className="text-xs text-gray-400">pcs</span>
                  {(parseInt(rejectLain) || 0) > 0 && (
                    <select value={alasanRejectLain} onChange={(e) => setAlasanRejectLain(e.target.value)}
                      disabled={locked}
                      className="flex-1 input py-1.5 text-sm">
                      {ALASAN_REJECT_LAIN.map((a) => (
                        <option key={a.key} value={a.key}>{a.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Total Aktual */}
            <div className="rounded-xl p-3 border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Aktual</span>
                <span className="font-bold text-gray-800">{formatAngka(sum)} pcs</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {showPack10
                  ? "(Isi 5×5) + (Isi 10×10) + Reject + Basi/Hilang + Lebihan"
                  : "(Isi 5×5) + Reject + Basi/Hilang + Lebihan"}
              </p>
            </div>

            {/* Selisih Rendam vs Aktual */}
            <div className={`rounded-xl p-3 border-2 ${!adaSelisih ? "bg-green-50 border-green-200" : selisihAktual > 0 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Selisih Rendam vs Aktual</p>
              <p className="text-xs text-gray-600">Direndam <b>{formatAngka(direndam)}</b> pcs → Aktual <b>{formatAngka(sum)}</b> pcs</p>
              <p className="mt-1.5 text-sm font-bold">
                {!adaSelisih
                  ? <span className="text-green-600">✅ Pas</span>
                  : selisihAktual > 0
                    ? <span className="text-blue-600">⚠️ Lebih {formatAngka(selisihAktual)} pcs</span>
                    : <span className="text-amber-600">⚠️ Kurang {formatAngka(-selisihAktual)} pcs (masuk Reject Packing)</span>}
              </p>
            </div>

            {/* Catatan Selisih */}
            <div>
              <label className={`label ${locked ? "text-gray-400" : ""}`}>
                {adaSelisih
                  ? <>Catatan Selisih <span className="text-red-500 font-semibold">(wajib)</span></>
                  : <>Catatan <span className="text-gray-400 font-normal">(optional)</span></>}
              </label>
              <textarea rows={2} className={`input resize-none ${locked ? "opacity-50 cursor-not-allowed bg-gray-100" : ""} ${adaSelisih && !catatanOk ? "border-red-300" : ""}`}
                placeholder={adaSelisih ? "Wajib: jelaskan kenapa ada selisih..." : "Catatan tambahan..."} value={catatan}
                onChange={(e) => setCatatan(e.target.value)} disabled={locked} />
            </div>

            {/* Koreksi Bahan Baku (auto preview) */}
            {adaSelisih && koreksiBahan.length > 0 && (
              <div className="rounded-xl p-3 border border-orange-200 bg-orange-50 space-y-1.5">
                <p className="text-xs font-bold text-orange-700">⚠️ Bahan baku akan dikoreksi:</p>
                {koreksiBahan.map((b) => (
                  <div key={b.nama} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{b.nama}</span>
                    <span className={`font-semibold ${selisihAktual > 0 ? "text-red-600" : "text-green-600"}`}>
                      {selisihAktual > 0
                        ? `− ${formatAngka(Math.round(b.gr))} gr tambahan`
                        : `+ ${formatAngka(Math.round(b.gr))} gr dikembalikan`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Submit Produksi — hanya di stage 1 */}
            {stage === "input" && (
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
                <button onClick={() => setStage("akumulasi")} disabled={!bolehSubmit || busy}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <CheckCircle size={16} /> Submit Produksi
                </button>
              </div>
            )}
          </div>

          {/* ── TAHAP 2: Akumulasi Lebihan (muncul setelah submit produksi) ── */}
          {stage === "akumulasi" && (
            <div className="space-y-4">
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Akumulasi Lebihan</p>

                {/* Breakdown */}
                <div className={`rounded-xl border-2 p-3 space-y-1 text-sm ${bisaGabung && !sudahGabung ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Lebihan kemarin{carryFromDate ? ` (${formatTanggal(carryFromDate)})` : ""}</span>
                    <span className={`font-semibold ${carryIn > 0 ? "text-amber-700" : "text-gray-400"}`}>{formatAngka(carryIn)} pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">+ Lebihan hari ini</span>
                    <span className="font-semibold text-gray-700">{formatAngka(leb)} pcs</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1 font-semibold">
                    <span className="text-gray-700">Total</span>
                    <span className={bisaGabung && !sudahGabung ? "text-orange-600" : "text-gray-900"}>{formatAngka(totalLebihan)} pcs</span>
                  </div>
                </div>

                {/* Case: bisa gabung & belum gabung */}
                {bisaGabung && !sudahGabung && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-orange-700">
                      ⚠ Lebihan bisa digabung jadi {extraPack} pack!
                    </p>
                    <button type="button" onClick={() => setSudahGabung(true)}
                      className="w-full py-2.5 rounded-xl font-semibold text-sm bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                      Gabungkan Lebihan → +{extraPack} Pack
                    </button>
                  </div>
                )}

                {/* Case: sudah gabung */}
                {sudahGabung && (
                  <div className="mt-3 rounded-xl bg-green-50 border-2 border-green-200 p-3 space-y-1.5 text-sm">
                    <p className="font-bold text-green-700 mb-1">✅ Lebihan digabungkan</p>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pack tambahan</span>
                      <span className="font-semibold text-green-700">+{extraPack} pack Isi 5</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Carry-over besok</span>
                      <span className="font-semibold text-gray-800">{formatAngka(carryOverBesok)} pcs</span>
                    </div>
                  </div>
                )}

                {/* Case: tidak perlu gabung (total < 5) */}
                {!bisaGabung && (
                  <div className="mt-3 rounded-xl bg-green-50 border-2 border-green-200 p-3 text-sm">
                    <p className="text-green-700 font-semibold">
                      {totalLebihan === 0
                        ? "✅ Tidak ada carry-over besok"
                        : `✅ Carry-over besok: ${formatAngka(totalLebihan)} pcs`}
                    </p>
                  </div>
                )}
              </div>

              {/* Tombol Selesai — muncul jika tidak bisa gabung ATAU sudah gabung */}
              {(!bisaGabung || sudahGabung) && (
                <div className="flex gap-2">
                  <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
                  <button
                    onClick={() => onConfirm({ pack5: p5, pack5Final, pack10: p10, reject: rej, rejectLain: rejL, alasanRejectLain, lebihan: leb, catatan })}
                    disabled={busy}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> {busy ? "Memproses..." : "Selesai"}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── StageList: kartu batch per stage ──────────────────────────
function StageList({ title, batches, renderActions, emphasizeDate }: {
  title: string;
  batches: Batch[];
  renderActions: (b: Batch) => React.ReactNode;
  emphasizeDate?: boolean;
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
                    <p className="text-xs text-gray-400">Disubmit {formatTanggalWaktu(b.created_at)} · oleh {(b.users as { nama: string })?.nama ?? "—"}</p>
                  </div>
                  <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                </div>
                {emphasizeDate && (
                  <div className="flex items-center gap-1.5 mb-2 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5 text-xs">
                    <CalendarDays size={13} className="text-blue-500 shrink-0" />
                    <span className="text-blue-600">Batch Tanggal Produksi: <b className="text-blue-700">{formatTanggal(b.tanggal_produksi)}</b></span>
                  </div>
                )}
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
