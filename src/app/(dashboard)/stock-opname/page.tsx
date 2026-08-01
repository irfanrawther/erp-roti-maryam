"use client";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { formatAngka } from "@/lib/utils";
import { ClipboardList, CheckCircle2, Clock, AlertCircle, ChevronDown, X, RotateCcw, Pencil } from "lucide-react";

// ── Types ────────────────────────────────────────────────────
type OpnameStatus = "draft" | "pending_approval" | "approved" | "rejected";

interface OpnameRow {
  id: string;
  periode: string;
  status: OpnameStatus;
  catatan_pic: string | null;
  catatan_approval: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  pic: { nama: string };
  approver: { nama: string } | null;
}

interface DetailBahan {
  id: string;
  bahan_id: string;
  stok_sistem: number;
  stok_fisik: number | null;
  stok_utuh: number | null;
  satuan_utuh: string | null;
  stok_sisa: number | null;
  satuan_sisa: string | null;
  bahan_baku: { nama: string; satuan: string };
}

interface DetailProduk {
  id: string;
  produk_id: string;
  stok_sistem: number;
  stok_fisik: number | null;
  produk_sku: { brand: string; varian: string; isi_per_pack: number };
}

interface DetailReject {
  id: string;
  reject_id: string;
  stok_sistem: number;
  stok_fisik: number | null;
  stok_produk_reject: { brand: string; varian: string };
}

interface BahanBaku { id: string; nama: string; satuan: string; stok_saat_ini: number; }
interface ProdukSku  { id: string; brand: string; varian: string; isi_per_pack: number; stok_saat_ini: number; }
interface RejectStok { id: string; brand: string; varian: string; stok_pcs: number; }

// ── Helpers ──────────────────────────────────────────────────
const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

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

// Satuan options per tipe bahan
function getSatuanOptions(satuanBahan: string): string[] {
  const s = satuanBahan.toLowerCase();
  if (s === "kg" || s === "gr")        return ["gr", "kg"];
  if (s === "liter" || s === "ml")     return ["ml", "liter"];
  return [satuanBahan.toLowerCase()];  // pcs, dll
}

// Convert nilai dari satuan apapun ke satuan standar bahan (kg/liter/pcs)
function toStdUnit(nilai: number, satuan: string): number {
  const s = satuan.toLowerCase();
  if (s === "gr") return nilai / 1000;
  if (s === "ml") return nilai / 1000;
  return nilai;
}

function periodeLabel(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
}

// Pakai tanggal WIB (bukan jam lokal device) biar konsisten dengan sisa aplikasi
function todayWIBParts(): { year: number; month: number } {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // "YYYY-MM-DD"
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m };
}

function currentPeriode(): string {
  const { year, month } = todayWIBParts();
  return `${year}-${String(month).padStart(2, "0")}`;
}

const STATUS_CONFIG: Record<OpnameStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft:            { label: "Draft",              color: "bg-gray-100 text-gray-600",    icon: RotateCcw    },
  pending_approval: { label: "Menunggu Approval",  color: "bg-yellow-100 text-yellow-700", icon: Clock        },
  approved:         { label: "Approved",            color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  rejected:         { label: "Ditolak",             color: "bg-red-100 text-red-600",      icon: AlertCircle  },
};

function StatusBadge({ status }: { status: OpnameStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

const CANE_VARIANTS  = ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"];
const MEHANA_VARIANTS = ["Original", "Cokelat", "Keju"];

function produkLabel(brand: string, varian: string, isi_per_pack?: number): string {
  const brandLabel = brand === "cane" ? "Cane RawtheR" : brand === "mehana" ? "Mehana Boga Utama" : brand;
  const isiLabel   = brand === "mehana" && isi_per_pack ? ` (${isi_per_pack} pcs)` : "";
  return `${brandLabel} — ${varian}${isiLabel}`;
}

function sortProduk(list: ProdukSku[]): ProdukSku[] {
  return [...list].sort((a, b) => {
    // Cane dulu, lalu Mehana
    if (a.brand !== b.brand) return a.brand === "cane" ? -1 : 1;
    if (a.brand === "cane") {
      return (CANE_VARIANTS.indexOf(a.varian) ?? 99) - (CANE_VARIANTS.indexOf(b.varian) ?? 99);
    }
    // Mehana: urutkan isi_per_pack dulu (5 sebelum 10), lalu varian
    if (a.isi_per_pack !== b.isi_per_pack) return a.isi_per_pack - b.isi_per_pack;
    return (MEHANA_VARIANTS.indexOf(a.varian) ?? 99) - (MEHANA_VARIANTS.indexOf(b.varian) ?? 99);
  });
}

function sortReject(list: RejectStok[]): RejectStok[] {
  return [...list].sort((a, b) => {
    if (a.brand !== b.brand) return a.brand === "cane" ? -1 : 1;
    const order = a.brand === "cane" ? CANE_VARIANTS : MEHANA_VARIANTS;
    return (order.indexOf(a.varian) ?? 99) - (order.indexOf(b.varian) ?? 99);
  });
}

function rejectLabel(brand: string, varian: string): string {
  const brandLabel = brand === "cane" ? "Cane RawtheR" : brand === "mehana" ? "Mehana Boga Utama" : brand;
  return `${brandLabel} — ${varian}`;
}

// ── Main Component ───────────────────────────────────────────
export default function StockOpnamePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const [periode, setPeriode] = useState(currentPeriode());

  // Data
  const [opname,       setOpname]       = useState<OpnameRow | null>(null);
  const [detailBahan,  setDetailBahan]  = useState<DetailBahan[]>([]);
  const [detailProduk, setDetailProduk] = useState<DetailProduk[]>([]);
  const [detailReject, setDetailReject] = useState<DetailReject[]>([]);
  const [bahanList,    setBahanList]    = useState<BahanBaku[]>([]);
  const [skuList,      setSkuList]      = useState<ProdukSku[]>([]);
  const [rejectList,   setRejectList]   = useState<RejectStok[]>([]);
  const [allOpname,    setAllOpname]    = useState<OpnameRow[]>([]);

  // Local input state — bahan: utuh + sisa dengan satuan masing-masing
  const [utuhBahan,      setUtuhBahan]      = useState<Record<string, string>>({});
  const [satuanUtuhBahan,setSatuanUtuhBahan]= useState<Record<string, string>>({});
  const [sisaBahan,      setSisaBahan]      = useState<Record<string, string>>({});
  const [satuanSisaBahan,setSatuanSisaBahan]= useState<Record<string, string>>({});
  const [fisikProduk, setFisikProduk] = useState<Record<string, string>>({});
  const [fisikReject, setFisikReject] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [catatanPic,  setCatatanPic]  = useState("");

  // UI
  const [activeTab,   setActiveTab]   = useState<"input" | "review">("input");
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState("");
  const [error,       setError]       = useState("");

  // Review modal
  const [reviewModal,       setReviewModal]       = useState<OpnameRow | null>(null);
  const [reviewDetailBahan, setReviewDetailBahan] = useState<DetailBahan[]>([]);
  const [reviewDetailProduk,setReviewDetailProduk]= useState<DetailProduk[]>([]);
  const [reviewDetailReject,setReviewDetailReject]= useState<DetailReject[]>([]);
  const [catatanApproval,   setCatatanApproval]   = useState("");
  const [approvalBusy,      setApprovalBusy]      = useState(false);
  const [undoBusy,          setUndoBusy]          = useState(false);

  // Edit inline stok utuh/sisa + satuan (Super Admin, koreksi kesalahan input)
  const [editBahanId,     setEditBahanId]     = useState<string | null>(null);
  const [editUtuhVal,     setEditUtuhVal]     = useState("");
  const [editUtuhSat,     setEditUtuhSat]     = useState("");
  const [editSisaVal,     setEditSisaVal]     = useState("");
  const [editSisaSat,     setEditSisaSat]     = useState("");
  const [editBahanBusy,   setEditBahanBusy]   = useState(false);

  // Period selector years (WIB, konsisten dengan currentPeriode)
  const nowWIB = todayWIBParts();
  const thisYear = nowWIB.year;
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const [selYear,  setSelYear]  = useState(nowWIB.year);
  const [selMonth, setSelMonth] = useState(nowWIB.month);

  useEffect(() => {
    const u = getUserSession();
    setUser(u);
    setMounted(true);
    if (u) {
      const caps = getCapabilities(u);
      if (!caps.stockOpname) router.replace(homeRoute(u));
    } else {
      router.replace("/login");
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const p = `${selYear}-${String(selMonth).padStart(2, "0")}`;
    setPeriode(p);
  }, [selYear, selMonth]);

  const fetchMaster = useCallback(async () => {
    const [bahanRes, skuRes, rejectRes] = await Promise.all([
      supabase.from("bahan_baku").select("id,nama,satuan,stok_saat_ini").eq("aktif", true),
      supabase.from("produk_sku").select("id,brand,varian,isi_per_pack,stok_saat_ini").eq("aktif", true),
      supabase.from("stok_produk_reject").select("id,brand,varian,stok_pcs").eq("aktif", true),
    ]);
    if (bahanRes.data)  setBahanList(sortBahan(bahanRes.data as BahanBaku[]));
    if (skuRes.data)    setSkuList(sortProduk(skuRes.data as ProdukSku[]));
    if (rejectRes.data) setRejectList(sortReject(rejectRes.data as RejectStok[]));
  }, []);

  const fetchOpname = useCallback(async (p: string) => {
    const { data } = await supabase
      .from("stock_opname")
      .select("id,periode,status,catatan_pic,catatan_approval,created_at,submitted_at,approved_at,pic:pic_id(nama),approver:approved_by(nama)")
      .eq("periode", p)
      .maybeSingle();

    const op = data as OpnameRow | null;
    setOpname(op);

    if (op) {
      const [dbahan, dproduk, dreject] = await Promise.all([
        supabase.from("stock_opname_detail_bahan")
          .select("id,bahan_id,stok_sistem,stok_fisik,stok_utuh,satuan_utuh,stok_sisa,satuan_sisa,bahan_baku:bahan_id(nama,satuan)")
          .eq("opname_id", op.id).order("bahan_id"),
        supabase.from("stock_opname_detail_produk")
          .select("id,produk_id,stok_sistem,stok_fisik,produk_sku:produk_id(brand,varian,isi_per_pack)")
          .eq("opname_id", op.id).order("produk_id"),
        supabase.from("stock_opname_detail_reject")
          .select("id,reject_id,stok_sistem,stok_fisik,stok_produk_reject:reject_id(brand,varian)")
          .eq("opname_id", op.id).order("reject_id"),
      ]);
      const dbahanData = (dbahan.data ?? []) as unknown as DetailBahan[];
      const dprodukData = (dproduk.data ?? []) as unknown as DetailProduk[];
      const drejectData = (dreject.data ?? []) as unknown as DetailReject[];
      setDetailBahan(dbahanData);
      setDetailProduk(dprodukData);
      setDetailReject(drejectData);

      // Seed local inputs from existing DB values
      const fu: Record<string, string> = {};
      const fsu: Record<string, string> = {};
      const fs: Record<string, string> = {};
      const fss: Record<string, string> = {};
      dbahanData.forEach((d) => {
        const defSat = d.bahan_baku?.satuan?.toLowerCase() ?? "kg";
        fu[d.bahan_id]  = (d.stok_utuh  != null && d.stok_utuh  > 0) ? String(d.stok_utuh)  : "";
        fsu[d.bahan_id] = d.satuan_utuh ?? defSat;
        fs[d.bahan_id]  = (d.stok_sisa  != null && d.stok_sisa  > 0) ? String(d.stok_sisa)  : "";
        fss[d.bahan_id] = d.satuan_sisa ?? defSat;
      });
      setUtuhBahan(fu); setSatuanUtuhBahan(fsu);
      setSisaBahan(fs);  setSatuanSisaBahan(fss);
      const fp: Record<string, string> = {};
      dprodukData.forEach((d) => { if (d.stok_fisik != null) fp[d.produk_id] = String(d.stok_fisik); });
      setFisikProduk(fp);
      const fr: Record<string, string> = {};
      drejectData.forEach((d) => { if (d.stok_fisik != null) fr[d.reject_id] = String(d.stok_fisik); });
      setFisikReject(fr);
      setCatatanPic(op.catatan_pic ?? "");
    } else {
      setDetailBahan([]);
      setDetailProduk([]);
      setDetailReject([]);
      setUtuhBahan({}); setSatuanUtuhBahan({});
      setSisaBahan({}); setSatuanSisaBahan({});
      setFisikProduk({});
      setFisikReject({});
      setCatatanPic("");
    }
  }, []);

  const fetchAllOpname = useCallback(async () => {
    const { data } = await supabase
      .from("stock_opname")
      .select("id,periode,status,catatan_pic,catatan_approval,created_at,submitted_at,approved_at,pic:pic_id(nama),approver:approved_by(nama)")
      .order("created_at", { ascending: false });
    setAllOpname((data ?? []) as unknown as OpnameRow[]);
  }, []);

  useEffect(() => {
    fetchAllOpname();
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchMaster();
    fetchOpname(periode);
  }, [periode, fetchOpname, fetchMaster]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── Buat Opname Baru ────────────────────────────────────────
  async function handleBuatOpname() {
    if (!user) return;
    setBusy(true);
    setError("");

    // Create opname row
    const { data: newOp, error: opErr } = await supabase
      .from("stock_opname")
      .insert({ periode, pic_id: user.id, status: "draft" })
      .select("id")
      .single();

    if (opErr || !newOp) {
      setError("Gagal membuat opname: " + (opErr?.message ?? "unknown"));
      setBusy(false);
      return;
    }
    const opId = (newOp as { id: string }).id;

    // Refresh master data first
    const [bahanRes, skuRes, rejectRes] = await Promise.all([
      supabase.from("bahan_baku").select("id,nama,satuan,stok_saat_ini").eq("aktif", true),
      supabase.from("produk_sku").select("id,brand,varian,isi_per_pack,stok_saat_ini").eq("aktif", true),
      supabase.from("stok_produk_reject").select("id,brand,varian,stok_pcs").eq("aktif", true),
    ]);
    const bahans  = (bahanRes.data ?? [])  as BahanBaku[];
    const skus    = (skuRes.data ?? [])    as ProdukSku[];
    const rejects = (rejectRes.data ?? []) as RejectStok[];

    // Snapshot detail rows
    await Promise.all([
      supabase.from("stock_opname_detail_bahan").insert(
        bahans.map((b) => ({ opname_id: opId, bahan_id: b.id, stok_sistem: b.stok_saat_ini }))
      ),
      supabase.from("stock_opname_detail_produk").insert(
        skus.map((s) => ({ opname_id: opId, produk_id: s.id, stok_sistem: s.stok_saat_ini }))
      ),
      supabase.from("stock_opname_detail_reject").insert(
        rejects.map((r) => ({ opname_id: opId, reject_id: r.id, stok_sistem: r.stok_pcs }))
      ),
    ]);

    await fetchMaster();
    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Opname baru berhasil dibuat.");
    setBusy(false);
  }

  // ── Reset Input ─────────────────────────────────────────────
  async function handleReset() {
    if (!opname) return;
    setBusy(true);
    setError("");
    // Clear semua input di DB + reset status opname ke draft
    await Promise.all([
      ...detailBahan.map((d) =>
        supabase.from("stock_opname_detail_bahan")
          .update({ stok_utuh: null, satuan_utuh: null, stok_sisa: null, satuan_sisa: null, stok_fisik: null })
          .eq("id", d.id)
      ),
      ...detailProduk.map((d) =>
        supabase.from("stock_opname_detail_produk")
          .update({ stok_fisik: null })
          .eq("id", d.id)
      ),
      ...detailReject.map((d) =>
        supabase.from("stock_opname_detail_reject")
          .update({ stok_fisik: null })
          .eq("id", d.id)
      ),
      supabase.from("stock_opname")
        .update({ status: "draft", catatan_approval: null, catatan_pic: null, submitted_at: null })
        .eq("id", opname.id),
    ]);
    // Langsung update opname state lokal agar UI langsung berubah
    setOpname((prev) => prev ? { ...prev, status: "draft", catatan_approval: null, catatan_pic: null, submitted_at: null } : null);
    setUtuhBahan({}); setSatuanUtuhBahan({});
    setSisaBahan({}); setSatuanSisaBahan({});
    setFisikProduk({});
    setFisikReject({});
    setCatatanPic("");
    setShowResetConfirm(false);
    await fetchAllOpname();
    showToast("Input opname berhasil direset.");
    setBusy(false);
  }

  // ── Simpan Draft ────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!opname) return;
    setBusy(true);
    setError("");

    await Promise.all([
      ...detailBahan.map((d) => {
        const liveStok  = bahanList.find((b) => b.id === d.bahan_id)?.stok_saat_ini ?? d.stok_sistem;
        const defSat    = d.bahan_baku?.satuan?.toLowerCase() ?? "kg";
        const utuhVal   = utuhBahan[d.bahan_id] ?? "";
        const utuhNum   = utuhVal !== "" ? parseFloat(utuhVal) : null;
        const sisaVal   = sisaBahan[d.bahan_id] ?? "";
        const sisaNum   = sisaVal !== "" ? parseFloat(sisaVal) : null;
        const satU      = satuanUtuhBahan[d.bahan_id] ?? defSat;
        const satS      = satuanSisaBahan[d.bahan_id] ?? defSat;
        const utuhStd   = utuhNum != null && !isNaN(utuhNum) ? toStdUnit(utuhNum, satU) : 0;
        const sisaStd   = sisaNum != null && !isNaN(sisaNum) ? toStdUnit(sisaNum, satS) : 0;
        const fisikTotal = (utuhNum != null || sisaNum != null) ? utuhStd + sisaStd : null;
        return supabase.from("stock_opname_detail_bahan")
          .update({
            stok_utuh:   utuhNum,
            satuan_utuh: satU,
            stok_sisa:   sisaNum,
            satuan_sisa: satS,
            stok_fisik:  fisikTotal,
            stok_sistem: liveStok,
          })
          .eq("id", d.id);
      }),
      ...detailProduk.map((d) => {
        const val      = fisikProduk[d.produk_id];
        const num      = val !== undefined && val !== "" ? parseFloat(val) : null;
        const liveStok = skuList.find((s) => s.id === d.produk_id)?.stok_saat_ini ?? d.stok_sistem;
        return supabase.from("stock_opname_detail_produk")
          .update({ stok_fisik: (num !== null && !isNaN(num)) ? num : null, stok_sistem: liveStok })
          .eq("id", d.id);
      }),
      ...detailReject.map((d) => {
        const val      = fisikReject[d.reject_id];
        const num      = val !== undefined && val !== "" ? parseFloat(val) : null;
        const liveStok = rejectList.find((r) => r.id === d.reject_id)?.stok_pcs ?? d.stok_sistem;
        return supabase.from("stock_opname_detail_reject")
          .update({ stok_fisik: (num !== null && !isNaN(num)) ? num : null, stok_sistem: liveStok })
          .eq("id", d.id);
      }),
      supabase.from("stock_opname")
        .update({ catatan_pic: catatanPic || null })
        .eq("id", opname.id),
    ]);

    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Draft tersimpan.");
    setBusy(false);
  }

  // ── Kirim ke Super Admin ─────────────────────────────────────
  async function handleSubmit() {
    if (!opname) return;
    setBusy(true);
    setError("");

    // Save draft first (also refresh stok_sistem snapshot)
    await Promise.all([
      ...detailBahan.map((d) => {
        const liveStok  = bahanList.find((b) => b.id === d.bahan_id)?.stok_saat_ini ?? d.stok_sistem;
        const defSat    = d.bahan_baku?.satuan?.toLowerCase() ?? "kg";
        const utuhVal   = utuhBahan[d.bahan_id] ?? "";
        const utuhNum   = utuhVal !== "" ? parseFloat(utuhVal) : null;
        const sisaVal   = sisaBahan[d.bahan_id] ?? "";
        const sisaNum   = sisaVal !== "" ? parseFloat(sisaVal) : null;
        const satU      = satuanUtuhBahan[d.bahan_id] ?? defSat;
        const satS      = satuanSisaBahan[d.bahan_id] ?? defSat;
        const utuhStd   = utuhNum != null && !isNaN(utuhNum) ? toStdUnit(utuhNum, satU) : 0;
        const sisaStd   = sisaNum != null && !isNaN(sisaNum) ? toStdUnit(sisaNum, satS) : 0;
        const fisikTotal = (utuhNum != null || sisaNum != null) ? utuhStd + sisaStd : null;
        return supabase.from("stock_opname_detail_bahan")
          .update({
            stok_utuh:   utuhNum,
            satuan_utuh: satU,
            stok_sisa:   sisaNum,
            satuan_sisa: satS,
            stok_fisik:  fisikTotal,
            stok_sistem: liveStok,
          })
          .eq("id", d.id);
      }),
      ...detailProduk.map((d) => {
        const val      = fisikProduk[d.produk_id];
        const num      = val !== undefined && val !== "" ? parseFloat(val) : null;
        const liveStok = skuList.find((s) => s.id === d.produk_id)?.stok_saat_ini ?? d.stok_sistem;
        return supabase.from("stock_opname_detail_produk")
          .update({ stok_fisik: (num !== null && !isNaN(num)) ? num : null, stok_sistem: liveStok })
          .eq("id", d.id);
      }),
      ...detailReject.map((d) => {
        const val      = fisikReject[d.reject_id];
        const num      = val !== undefined && val !== "" ? parseFloat(val) : null;
        const liveStok = rejectList.find((r) => r.id === d.reject_id)?.stok_pcs ?? d.stok_sistem;
        return supabase.from("stock_opname_detail_reject")
          .update({ stok_fisik: (num !== null && !isNaN(num)) ? num : null, stok_sistem: liveStok })
          .eq("id", d.id);
      }),
    ]);

    const { error: err } = await supabase.from("stock_opname")
      .update({ status: "pending_approval", submitted_at: new Date().toISOString(), catatan_pic: catatanPic || null })
      .eq("id", opname.id);

    if (err) { setError("Gagal mengirim: " + err.message); setBusy(false); return; }

    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Opname berhasil dikirim ke Super Admin untuk approval.");
    setBusy(false);
  }

  // ── Open Review Modal ────────────────────────────────────────
  async function openReview(op: OpnameRow) {
    setReviewModal(op);
    setCatatanApproval("");
    const [dbahan, dproduk, dreject] = await Promise.all([
      supabase.from("stock_opname_detail_bahan")
        .select("id,bahan_id,stok_sistem,stok_fisik,stok_utuh,satuan_utuh,stok_sisa,satuan_sisa,bahan_baku:bahan_id(nama,satuan)")
        .eq("opname_id", op.id),
      supabase.from("stock_opname_detail_produk")
        .select("id,produk_id,stok_sistem,stok_fisik,produk_sku:produk_id(brand,varian,isi_per_pack)")
        .eq("opname_id", op.id),
      supabase.from("stock_opname_detail_reject")
        .select("id,reject_id,stok_sistem,stok_fisik,stok_produk_reject:reject_id(brand,varian)")
        .eq("opname_id", op.id),
    ]);
    setReviewDetailBahan((dbahan.data ?? []) as unknown as DetailBahan[]);
    setReviewDetailProduk((dproduk.data ?? []) as unknown as DetailProduk[]);
    setReviewDetailReject((dreject.data ?? []) as unknown as DetailReject[]);
  }

  async function refreshReviewBahan(opnameId: string) {
    const { data } = await supabase.from("stock_opname_detail_bahan")
      .select("id,bahan_id,stok_sistem,stok_fisik,stok_utuh,satuan_utuh,stok_sisa,satuan_sisa,bahan_baku:bahan_id(nama,satuan)")
      .eq("opname_id", opnameId);
    setReviewDetailBahan((data ?? []) as unknown as DetailBahan[]);
  }

  function openEditBahan(d: DetailBahan) {
    const defSat = d.bahan_baku?.satuan?.toLowerCase() ?? "kg";
    setEditBahanId(d.id);
    setEditUtuhVal(d.stok_utuh != null ? String(d.stok_utuh) : "");
    setEditUtuhSat(d.satuan_utuh ?? defSat);
    setEditSisaVal(d.stok_sisa != null ? String(d.stok_sisa) : "");
    setEditSisaSat(d.satuan_sisa ?? defSat);
  }

  async function simpanEditBahan(d: DetailBahan) {
    setEditBahanBusy(true);
    const utuhNum = editUtuhVal !== "" ? parseFloat(editUtuhVal) : null;
    const sisaNum = editSisaVal !== "" ? parseFloat(editSisaVal) : null;
    const utuhStd = utuhNum != null && !isNaN(utuhNum) ? toStdUnit(utuhNum, editUtuhSat) : 0;
    const sisaStd = sisaNum != null && !isNaN(sisaNum) ? toStdUnit(sisaNum, editSisaSat) : 0;
    const fisikTotal = (utuhNum != null || sisaNum != null) ? utuhStd + sisaStd : null;
    await supabase.from("stock_opname_detail_bahan").update({
      stok_utuh: utuhNum, satuan_utuh: editUtuhSat,
      stok_sisa: sisaNum, satuan_sisa: editSisaSat,
      stok_fisik: fisikTotal,
    }).eq("id", d.id);
    setEditBahanId(null);
    setEditBahanBusy(false);
    if (reviewModal) await refreshReviewBahan(reviewModal.id);
  }

  // ── Undo Approve (Super Admin) ─────────────────────────────
  async function handleUndoApprove() {
    if (!reviewModal || !user) return;
    if (!confirm("Undo approve opname ini? Perubahan stok yang sudah diterapkan akan dibalik, dan opname kembali ke status menunggu approval.")) return;
    setUndoBusy(true);
    const { data, error: err } = await supabase.rpc("undo_approve_stock_opname", {
      p_opname_id: reviewModal.id,
      p_admin_id:  user.id,
      p_catatan:   catatanApproval || null,
    });
    const result = data as { ok: boolean; message?: string } | null;
    if (err || !result?.ok) {
      setError("Gagal undo approve: " + (err?.message ?? result?.message ?? "unknown"));
      setUndoBusy(false);
      return;
    }
    setReviewModal((m) => m ? { ...m, status: "pending_approval" } : m);
    await refreshReviewBahan(reviewModal.id);
    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Approve dibatalkan. Opname kembali ke status menunggu approval — silakan koreksi lalu approve ulang.");
    setUndoBusy(false);
  }

  // ── Approve ─────────────────────────────────────────────────
  async function handleApprove() {
    if (!reviewModal || !user) return;
    setApprovalBusy(true);
    const { data, error: err } = await supabase.rpc("approve_stock_opname", {
      p_opname_id: reviewModal.id,
      p_admin_id:  user.id,
      p_catatan:   catatanApproval || null,
    });
    const result = data as { ok: boolean; message?: string } | null;
    if (err || !result?.ok) {
      setError("Gagal approve: " + (err?.message ?? result?.message ?? "unknown"));
      setApprovalBusy(false);
      return;
    }
    setReviewModal(null);
    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Opname berhasil di-approve. Stok telah diperbarui.");
    setApprovalBusy(false);
  }

  // ── Reject ──────────────────────────────────────────────────
  async function handleReject() {
    if (!reviewModal || !user) return;
    setApprovalBusy(true);
    const { data, error: err } = await supabase.rpc("reject_stock_opname", {
      p_opname_id: reviewModal.id,
      p_admin_id:  user.id,
      p_catatan:   catatanApproval || null,
    });
    const result2 = data as { ok: boolean; message?: string } | null;
    if (err || !result2?.ok) {
      setError("Gagal tolak: " + (err?.message ?? result2?.message ?? "unknown"));
      setApprovalBusy(false);
      return;
    }
    setReviewModal(null);
    await fetchOpname(periode);
    await fetchAllOpname();
    showToast("Opname ditolak. PIC dapat melakukan revisi.");
    setApprovalBusy(false);
  }

  if (!mounted) return null;

  const caps = getCapabilities(user);
  const canInput  = !!user && (user.role === "pic" || caps.isSuperAdmin);
  const isLocked  = opname?.status === "pending_approval" || opname?.status === "approved";
  const pendingCount = allOpname.filter((o) => o.status === "pending_approval").length;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-xs">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <ClipboardList size={22} className="text-amber-500" />
        <h1 className="text-xl font-bold text-gray-800">Stock Opname</h1>
      </div>

      {/* Period Selector */}
      <div className="card flex items-center gap-3 py-3">
        <span className="text-sm font-medium text-gray-600">Periode:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}
              className="appearance-none bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:border-amber-400">
              {BULAN_ID.map((b, i) => <option key={i} value={i + 1}>{b}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}
              className="appearance-none bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:border-amber-400">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        <button onClick={() => setActiveTab("input")}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === "input" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
          Input Opname
        </button>
        {caps.isSuperAdmin && (
          <button onClick={() => setActiveTab("review")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors relative ${activeTab === "review" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            Review & Approve
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      {/* ── Tab: Input Opname ── */}
      {activeTab === "input" && canInput && (
        <div className="space-y-4">
          {/* Status banner */}
          {opname ? (
            <div className="card py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={opname.status} />
                <span className="text-xs text-gray-400">
                  oleh <span className="font-medium text-gray-600">{opname.pic?.nama}</span>
                </span>
              </div>
              {opname.status === "rejected" && opname.catatan_approval && (
                <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-lg max-w-xs truncate">
                  {opname.catatan_approval}
                </span>
              )}
            </div>
          ) : (
            <div className="card py-6 text-center space-y-3">
              <p className="text-sm text-gray-500">Belum ada opname untuk <span className="font-semibold">{periodeLabel(periode)}</span>.</p>
              <button onClick={handleBuatOpname} disabled={busy}
                className="btn-primary text-sm px-5 py-2 disabled:opacity-60">
                {busy ? "Membuat..." : "Buat Opname Baru"}
              </button>
            </div>
          )}

          {opname && (
            <>
              {/* ── BAHAN BAKU ── */}
              <div className="card overflow-hidden p-0">
                <div className="bg-amber-500 px-4 py-2.5">
                  <p className="font-bold text-white text-sm">Bahan Baku — {periodeLabel(periode)}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <th className="text-left px-3 py-2 min-w-[100px]">Bahan</th>
                        <th className="text-right px-2 py-2 min-w-[80px]">Sistem</th>
                        <th className="text-center px-2 py-2 min-w-[140px]">Stok Utuh</th>
                        <th className="text-center px-2 py-2 min-w-[140px]">Stok Sisa</th>
                        <th className="text-right px-2 py-2 min-w-[70px]">Fisik</th>
                        <th className="text-right px-3 py-2 min-w-[70px]">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bahanList.map((bahan) => {
                        const d = detailBahan.find((x) => x.bahan_id === bahan.id);
                        if (!d) return null;
                        const sat       = bahan.satuan.toLowerCase();
                        const liveStok  = bahan.stok_saat_ini;
                        const satuanOpts = getSatuanOptions(sat);
                        const defSat    = sat;

                        const utuhVal = utuhBahan[bahan.id] ?? "";
                        const satU    = satuanUtuhBahan[bahan.id] ?? defSat;
                        const sisaVal = sisaBahan[bahan.id] ?? "";
                        const satS    = satuanSisaBahan[bahan.id] ?? defSat;

                        const utuhNum  = utuhVal !== "" ? parseFloat(utuhVal) : null;
                        const sisaNum  = sisaVal !== "" ? parseFloat(sisaVal) : null;
                        const utuhStd  = utuhNum != null ? toStdUnit(utuhNum, satU) : 0;
                        const sisaStd  = sisaNum != null ? toStdUnit(sisaNum, satS) : 0;
                        const fisikTotal = (utuhNum != null || sisaNum != null) ? utuhStd + sisaStd : null;
                        const selisih    = fisikTotal != null ? fisikTotal - liveStok : null;

                        return (
                          <tr key={d.id} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 font-medium text-gray-700 text-xs">{d.bahan_baku?.nama}</td>
                            <td className="px-2 py-2 text-right text-gray-500 text-xs whitespace-nowrap">
                              {formatAngka(liveStok)}<span className="text-gray-400 ml-0.5">{sat}</span>
                            </td>

                            {/* Stok Utuh */}
                            <td className="px-2 py-1.5">
                              {isLocked ? (
                                <span className="text-xs text-gray-600 block text-center">
                                  {d.stok_utuh != null ? `${formatAngka(d.stok_utuh)} ${d.satuan_utuh ?? sat}` : "—"}
                                </span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0" step="any"
                                    value={utuhVal}
                                    onChange={(e) => setUtuhBahan((p) => ({ ...p, [bahan.id]: e.target.value }))}
                                    className="w-16 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-amber-400 bg-white"
                                    placeholder=""
                                  />
                                  <select
                                    value={satU}
                                    onChange={(e) => setSatuanUtuhBahan((p) => ({ ...p, [bahan.id]: e.target.value }))}
                                    className="border border-gray-200 rounded px-1 py-1 text-xs bg-white focus:outline-none focus:border-amber-400"
                                  >
                                    {satuanOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* Stok Sisa */}
                            <td className="px-2 py-1.5">
                              {isLocked ? (
                                <span className="text-xs text-gray-600 block text-center">
                                  {d.stok_sisa ? `${formatAngka(d.stok_sisa)} ${d.satuan_sisa ?? sat}` : "—"}
                                </span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0" step="any"
                                    value={sisaVal}
                                    onChange={(e) => setSisaBahan((p) => ({ ...p, [bahan.id]: e.target.value }))}
                                    className="w-16 text-right border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-amber-400 bg-white"
                                    placeholder=""
                                  />
                                  <select
                                    value={satS}
                                    onChange={(e) => setSatuanSisaBahan((p) => ({ ...p, [bahan.id]: e.target.value }))}
                                    className="border border-gray-200 rounded px-1 py-1 text-xs bg-white focus:outline-none focus:border-amber-400"
                                  >
                                    {satuanOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* Fisik (auto) */}
                            <td className="px-2 py-2 text-right text-xs font-semibold text-gray-800 whitespace-nowrap">
                              {fisikTotal != null ? <>{formatAngka(fisikTotal)}<span className="text-gray-400 ml-0.5">{sat}</span></> : <span className="text-gray-300">—</span>}
                            </td>

                            {/* Selisih */}
                            <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap">
                              {selisih != null ? (
                                <span className={selisih > 0.0001 ? "text-green-600" : selisih < -0.0001 ? "text-red-600" : "text-gray-400"}>
                                  {selisih > 0 ? "+" : ""}{formatAngka(selisih)}<span className="font-normal ml-0.5">{sat}</span>
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── PRODUK JADI ── */}
              <div className="card overflow-hidden p-0">
                <div className="bg-blue-500 px-4 py-2.5">
                  <p className="font-bold text-white text-sm">Produk Jadi — {periodeLabel(periode)}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-2">Produk</th>
                        <th className="text-right px-3 py-2">Stok Sistem</th>
                        <th className="text-right px-3 py-2">Stok Fisik</th>
                        <th className="text-right px-4 py-2">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {skuList.map((sku) => {
                        const d = detailProduk.find((x) => x.produk_id === sku.id);
                        if (!d) return null;
                        const fisikVal  = fisikProduk[d.produk_id] ?? "";
                        const fisikNum  = fisikVal !== "" ? parseFloat(fisikVal) : null;
                        const liveStok  = sku.stok_saat_ini;
                        const selisih   = (fisikNum !== null && !isNaN(fisikNum)) ? fisikNum - liveStok : null;
                        return (
                          <tr key={d.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 font-medium text-gray-700">
                              {produkLabel(sku.brand, sku.varian, sku.isi_per_pack)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500">
                              {formatAngka(liveStok)} <span className="text-xs text-gray-400">pack</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isLocked ? (
                                <span className="text-gray-700">{d.stok_fisik != null ? `${formatAngka(d.stok_fisik)} pack` : "—"}</span>
                              ) : (
                                <input
                                  type="number" min="0" step="1"
                                  value={fisikVal}
                                  onChange={(e) => setFisikProduk((prev) => ({ ...prev, [d.produk_id]: e.target.value }))}
                                  className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-400 bg-white"
                                  placeholder="—"
                                />
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold">
                              {selisih !== null ? (
                                <span className={selisih > 0 ? "text-green-600" : selisih < 0 ? "text-red-600" : "text-gray-400"}>
                                  {selisih > 0 ? "+" : ""}{formatAngka(selisih)} pack
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── PRODUK REJECT ── */}
              <div className="card overflow-hidden p-0">
                <div className="bg-red-500 px-4 py-2.5">
                  <p className="font-bold text-white text-sm">Produk Reject — {periodeLabel(periode)} <span className="font-normal opacity-80">(pcs)</span></p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-2">Produk</th>
                        <th className="text-right px-3 py-2">Stok Sistem</th>
                        <th className="text-right px-3 py-2">Stok Fisik</th>
                        <th className="text-right px-4 py-2">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rejectList.map((rj) => {
                        const d = detailReject.find((x) => x.reject_id === rj.id);
                        if (!d) return null;
                        const fisikVal = fisikReject[d.reject_id] ?? "";
                        const fisikNum = fisikVal !== "" ? parseFloat(fisikVal) : null;
                        const liveStok = rj.stok_pcs;
                        const selisih  = (fisikNum !== null && !isNaN(fisikNum)) ? fisikNum - liveStok : null;
                        return (
                          <tr key={d.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 font-medium text-gray-700">{rejectLabel(rj.brand, rj.varian)}</td>
                            <td className="px-3 py-2.5 text-right text-gray-500">
                              {formatAngka(liveStok)} <span className="text-xs text-gray-400">pcs</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isLocked ? (
                                <span className="text-gray-700">{d.stok_fisik != null ? `${formatAngka(d.stok_fisik)} pcs` : "—"}</span>
                              ) : (
                                <input
                                  type="number" min="0" step="1"
                                  value={fisikVal}
                                  onChange={(e) => setFisikReject((prev) => ({ ...prev, [d.reject_id]: e.target.value }))}
                                  className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-red-400 bg-white"
                                  placeholder="—"
                                />
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold">
                              {selisih !== null ? (
                                <span className={selisih > 0 ? "text-green-600" : selisih < 0 ? "text-red-600" : "text-gray-400"}>
                                  {selisih > 0 ? "+" : ""}{formatAngka(selisih)} pcs
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Catatan PIC */}
              {!isLocked && (
                <div className="card space-y-2">
                  <label className="text-xs font-semibold text-gray-600">Catatan (opsional)</label>
                  <textarea
                    value={catatanPic}
                    onChange={(e) => setCatatanPic(e.target.value)}
                    rows={2}
                    placeholder="Catatan untuk Super Admin..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                  />
                </div>
              )}
              {opname.catatan_pic && isLocked && (
                <div className="card py-2 bg-amber-50">
                  <p className="text-xs text-gray-500 font-medium">Catatan PIC:</p>
                  <p className="text-sm text-gray-700 mt-0.5">{opname.catatan_pic}</p>
                </div>
              )}

              {/* Action buttons */}
              {!isLocked && opname.status !== "approved" && (
                <>
                {showResetConfirm && (
                  <div className="card border border-red-200 bg-red-50 space-y-3">
                    <p className="text-sm font-semibold text-red-700">Reset semua input opname ini?</p>
                    <p className="text-xs text-red-500">Semua angka yang sudah diinput (Stok Utuh, Stok Sisa, Stok Fisik Produk Jadi) akan dihapus dan tidak bisa dikembalikan.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowResetConfirm(false)} disabled={busy}
                        className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white transition-colors">
                        Batal
                      </button>
                      <button onClick={handleReset} disabled={busy}
                        className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-60">
                        {busy ? "Mereset..." : "Ya, Reset"}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowResetConfirm(true)} disabled={busy}
                    className="py-2.5 px-4 rounded-xl border-2 border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                    Reset
                  </button>
                  <button onClick={handleSaveDraft} disabled={busy}
                    className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    {busy ? "Menyimpan..." : "Simpan Draft"}
                  </button>
                  <button onClick={handleSubmit} disabled={busy}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60">
                    {busy ? "Mengirim..." : "Kirim ke Super Admin"}
                  </button>
                </div>
                </>
              )}

              {opname.status === "approved" && (
                <div className="card bg-green-50 py-3 text-center">
                  <p className="text-sm font-semibold text-green-700">
                    ✓ Opname telah di-approve oleh {opname.approver?.nama ?? "Super Admin"}
                  </p>
                  {opname.approved_at && (
                    <p className="text-xs text-green-500 mt-0.5">
                      {new Date(opname.approved_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Review & Approve ── */}
      {activeTab === "review" && caps.isSuperAdmin && (
        <div className="space-y-3">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5">
              <Clock size={15} className="text-yellow-600" />
              <p className="text-sm font-semibold text-yellow-700">{pendingCount} opname menunggu approval</p>
            </div>
          )}

          {allOpname.length === 0 ? (
            <div className="card text-center py-8 text-gray-400 text-sm">Belum ada stock opname.</div>
          ) : (
            allOpname.map((op) => (
              <div key={op.id}
                className={`card py-3 flex items-center justify-between gap-3 ${op.status === "pending_approval" ? "border-yellow-300 bg-yellow-50/30 cursor-pointer hover:bg-yellow-50 transition-colors" : ""}`}
                onClick={() => op.status !== "draft" && openReview(op)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{periodeLabel(op.periode)}</span>
                    <StatusBadge status={op.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    oleh <span className="font-medium text-gray-500">{op.pic?.nama}</span>
                    {op.submitted_at && ` · Dikirim ${new Date(op.submitted_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`}
                    {op.approved_at && ` · Approved ${new Date(op.approved_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`}
                  </p>
                  {op.catatan_approval && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">"{op.catatan_approval}"</p>
                  )}
                </div>
                {op.status === "pending_approval" && (
                  <span className="text-xs font-semibold text-yellow-700 shrink-0">Review →</span>
                )}
                {op.status === "approved" && (
                  <span className="text-xs text-green-600 shrink-0">oleh {op.approver?.nama}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Review Modal ── */}
      {reviewModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-800">Review Opname — {periodeLabel(reviewModal.periode)}</p>
                <p className="text-xs text-gray-500 mt-0.5">PIC: {reviewModal.pic?.nama}</p>
              </div>
              <button onClick={() => setReviewModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Bahan Baku review */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Bahan Baku</p>
                <div className="space-y-1.5">
                  {reviewDetailBahan.filter((d) => d.stok_fisik != null).map((d) => {
                    const selisih = d.stok_fisik! - d.stok_sistem;
                    const sat = d.bahan_baku?.satuan?.toLowerCase() ?? "";
                    const satOpts = getSatuanOptions(sat);
                    const isEditing = editBahanId === d.id;
                    const canEdit = caps.isSuperAdmin && reviewModal?.status === "pending_approval";
                    return (
                      <div key={d.id} className="rounded-lg border border-gray-100 px-2.5 py-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 font-medium">{d.bahan_baku?.nama}</span>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-gray-400 text-xs block">{formatAngka(d.stok_sistem)} → {formatAngka(d.stok_fisik!)} {sat}</span>
                              <span className={`text-xs font-bold ${selisih > 0 ? "text-green-600" : selisih < 0 ? "text-red-600" : "text-gray-400"}`}>
                                {selisih > 0 ? "+" : ""}{formatAngka(selisih)} {sat}
                              </span>
                            </div>
                            {canEdit && !isEditing && (
                              <button onClick={() => openEditBahan(d)} title="Koreksi stok utuh/sisa & satuan"
                                className="p-1 rounded-md text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors shrink-0">
                                <Pencil size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        {!isEditing ? (
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Stok utuh: {d.stok_utuh != null ? `${formatAngka(d.stok_utuh)} ${d.satuan_utuh ?? sat}` : "—"}
                            {" · "}Stok sisa: {d.stok_sisa != null ? `${formatAngka(d.stok_sisa)} ${d.satuan_sisa ?? sat}` : "—"}
                          </p>
                        ) : (
                          <div className="mt-1.5 space-y-1.5 bg-amber-50 rounded-lg p-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500 w-16 shrink-0">Stok utuh</span>
                              <input type="number" step="any" value={editUtuhVal} onChange={(e) => setEditUtuhVal(e.target.value)}
                                className="input py-1 text-sm flex-1" placeholder="0" />
                              <select value={editUtuhSat} onChange={(e) => setEditUtuhSat(e.target.value)} className="input py-1 text-sm w-20">
                                {satOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500 w-16 shrink-0">Stok sisa</span>
                              <input type="number" step="any" value={editSisaVal} onChange={(e) => setEditSisaVal(e.target.value)}
                                className="input py-1 text-sm flex-1" placeholder="0" />
                              <select value={editSisaSat} onChange={(e) => setEditSisaSat(e.target.value)} className="input py-1 text-sm w-20">
                                {satOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <div className="flex gap-2 pt-0.5">
                              <button onClick={() => setEditBahanId(null)} disabled={editBahanBusy}
                                className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-white">Batal</button>
                              <button onClick={() => simpanEditBahan(d)} disabled={editBahanBusy}
                                className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50">
                                {editBahanBusy ? "Menyimpan…" : "Simpan"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {reviewDetailBahan.filter((d) => d.stok_fisik == null).length > 0 && (
                    <p className="text-xs text-gray-400 italic">
                      {reviewDetailBahan.filter((d) => d.stok_fisik == null).length} bahan belum diisi.
                    </p>
                  )}
                </div>
              </div>

              {/* Produk Jadi review */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Produk Jadi</p>
                <div className="space-y-1">
                  {reviewDetailProduk.filter((d) => d.stok_fisik != null).map((d) => {
                    const selisih = d.stok_fisik! - d.stok_sistem;
                    return (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium">{produkLabel(d.produk_sku?.brand, d.produk_sku?.varian, d.produk_sku?.isi_per_pack)}</span>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-gray-400 text-xs">{formatAngka(d.stok_sistem)} → {formatAngka(d.stok_fisik!)} pack</span>
                          <span className={`text-xs font-bold w-16 text-right ${selisih > 0 ? "text-green-600" : selisih < 0 ? "text-red-600" : "text-gray-400"}`}>
                            {selisih > 0 ? "+" : ""}{formatAngka(selisih)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {reviewDetailProduk.filter((d) => d.stok_fisik == null).length > 0 && (
                    <p className="text-xs text-gray-400 italic">
                      {reviewDetailProduk.filter((d) => d.stok_fisik == null).length} produk belum diisi.
                    </p>
                  )}
                </div>
              </div>

              {/* Produk Reject review */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Produk Reject (pcs)</p>
                <div className="space-y-1">
                  {reviewDetailReject.filter((d) => d.stok_fisik != null).map((d) => {
                    const selisih = d.stok_fisik! - d.stok_sistem;
                    return (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium">{rejectLabel(d.stok_produk_reject?.brand, d.stok_produk_reject?.varian)}</span>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-gray-400 text-xs">{formatAngka(d.stok_sistem)} → {formatAngka(d.stok_fisik!)} pcs</span>
                          <span className={`text-xs font-bold w-16 text-right ${selisih > 0 ? "text-green-600" : selisih < 0 ? "text-red-600" : "text-gray-400"}`}>
                            {selisih > 0 ? "+" : ""}{formatAngka(selisih)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {reviewDetailReject.filter((d) => d.stok_fisik != null).length === 0 && (
                    <p className="text-xs text-gray-400 italic">Tidak ada input produk reject.</p>
                  )}
                </div>
              </div>

              {/* Catatan PIC */}
              {reviewModal.catatan_pic && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-500">Catatan PIC:</p>
                  <p className="text-sm text-gray-700 mt-0.5">{reviewModal.catatan_pic}</p>
                </div>
              )}

              {/* Catatan approval */}
              {reviewModal.status === "pending_approval" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600">Catatan (opsional)</label>
                  <textarea
                    value={catatanApproval}
                    onChange={(e) => setCatatanApproval(e.target.value)}
                    rows={2}
                    placeholder="Catatan approval atau alasan penolakan..."
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                  />
                </div>
              )}
            </div>

            {/* Modal footer */}
            {reviewModal.status === "pending_approval" && (
              <div className="p-5 border-t border-gray-100 flex gap-3">
                <button onClick={handleReject} disabled={approvalBusy}
                  className="flex-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                  {approvalBusy ? "..." : "Tolak"}
                </button>
                <button onClick={handleApprove} disabled={approvalBusy}
                  className="flex-2 flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-600 transition-colors disabled:opacity-60">
                  {approvalBusy ? "Memproses..." : "Approve & Finalize"}
                </button>
              </div>
            )}
            {reviewModal.status !== "pending_approval" && (
              <div className="p-5 border-t border-gray-100 space-y-2">
                {reviewModal.status === "approved" && caps.isSuperAdmin && (
                  <button onClick={handleUndoApprove} disabled={undoBusy}
                    className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <RotateCcw size={14} /> {undoBusy ? "Membatalkan…" : "Undo Approve"}
                  </button>
                )}
                <button onClick={() => setReviewModal(null)}
                  className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Tutup
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
