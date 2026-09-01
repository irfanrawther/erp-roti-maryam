// ============================================================
// Alur Pelanggaran & Poin — dipakai bersama oleh halaman submit SPV
// (/lapor-pelanggaran), review Manajer Operasional (/pelanggaran),
// dan kartu klarifikasi karyawan (dashboard-saya).
//
// Daftar pelanggaran & poinnya SELALU dari master_pelanggaran (rules
// engine, diseed dari 6 dokumen PP) — tidak ada daftar hardcode lain.
// ============================================================
import { supabase } from "@/lib/supabase";
import { tambahPoin } from "@/lib/poin";

export type StatusLaporan = "pending" | "menunggu_klarifikasi" | "diterima" | "ditolak";

export interface MasterPelanggaranRow {
  id: string; jalur: string; nomor: number | null; nama_pelanggaran: string;
  poin: number; tier: string; is_kebersihan: boolean; is_kolektif: boolean;
  eskalasi_poin: number | null; catatan: string | null;
}

export const TIER_LABEL: Record<string, string> = { tier1: "Tier 1 — Ringan", tier2: "Tier 2 — Sedang", tier3: "Tier 3 — Berat" };
export const TIER_ORDER = ["tier1", "tier2", "tier3"];
export const TIER_BADGE: Record<string, string> = {
  tier1: "bg-yellow-100 text-yellow-700", tier2: "bg-orange-100 text-orange-600", tier3: "bg-red-100 text-red-600",
};

const KOLOM = "id, jalur, nomor, nama_pelanggaran, poin, tier, is_kebersihan, is_kolektif, eskalasi_poin, catatan";

export async function ambilPelanggaranUmum(jalur: "training" | "staff"): Promise<MasterPelanggaranRow[]> {
  const { data } = await supabase.from("master_pelanggaran").select(KOLOM)
    .eq("jalur", jalur).eq("is_aktif", true).order("nomor");
  return (data as MasterPelanggaranRow[]) ?? [];
}
export async function ambilTier4(): Promise<MasterPelanggaranRow[]> {
  const { data } = await supabase.from("master_pelanggaran").select(KOLOM)
    .eq("jalur", "tier4").eq("is_aktif", true).order("nomor");
  return (data as MasterPelanggaranRow[]) ?? [];
}
export async function ambilSpvKhusus(): Promise<MasterPelanggaranRow[]> {
  const { data } = await supabase.from("master_pelanggaran").select(KOLOM)
    .eq("jalur", "spv_khusus").eq("is_aktif", true).order("nomor");
  return (data as MasterPelanggaranRow[]) ?? [];
}

export function labelStatus(s: StatusLaporan): string {
  return s === "pending" ? "Menunggu" : s === "menunggu_klarifikasi" ? "Menunggu Klarifikasi" : s === "diterima" ? "Diterima" : "Ditolak";
}
export function badgeStatus(s: StatusLaporan): string {
  return s === "pending" ? "bg-amber-100 text-amber-700"
    : s === "menunggu_klarifikasi" ? "bg-blue-100 text-blue-700"
    : s === "diterima" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600";
}

const JAM_RESPON = 48; // Pasal 6: karyawan diberi 2x24 jam sebelum keputusan final
export function hitungResponDeadline(dariIso: string): string {
  return new Date(new Date(dariIso).getTime() + JAM_RESPON * 3600_000).toISOString();
}
export function hitungKlarifikasiDeadline(dariIso: string, tambahanJam = JAM_RESPON): string {
  return new Date(new Date(dariIso).getTime() + tambahanJam * 3600_000).toISOString();
}

interface LaporanUntukAuto { id: string; karyawan_id: string; pelanggaran_id: string; tanggal_kejadian: string; respon_deadline: string | null; poin_override: number | null }

/**
 * "Cron ringan": jalan tiap kali Manajer Operasional membuka halaman
 * review. Laporan pending yang sudah lewat batas 2x24 jam TANPA
 * karyawan minta klarifikasi → otomatis dianggap tidak keberatan,
 * poin resmi ditetapkan (Pasal 6 ayat 6).
 *
 * Sengaja HANYA dipanggil dari halaman admin (bukan dari dashboard
 * karyawan) supaya tidak ada dua sesi menulis poin yang sama
 * bersamaan.
 */
export async function prosesOtomatisTanpaKlarifikasi(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase.from("laporan_pelanggaran")
    .select("id, karyawan_id, pelanggaran_id, tanggal_kejadian, respon_deadline, poin_override")
    .eq("status", "pending").lt("respon_deadline", nowIso);
  const rows = (data as LaporanUntukAuto[] | null) ?? [];
  for (const r of rows) {
    let poin = r.poin_override ?? 0;
    if (r.poin_override == null) {
      const { data: mp } = await supabase.from("master_pelanggaran").select("poin").eq("id", r.pelanggaran_id).maybeSingle();
      poin = Number((mp as { poin: number } | null)?.poin ?? 0);
    }
    await supabase.from("laporan_pelanggaran").update({
      status: "diterima", direview_oleh: "Sistem", direview_at: nowIso,
      catatan_review: "Otomatis diterima — tidak ada klarifikasi dalam 2x24 jam (Pasal 6).",
    }).eq("id", r.id);
    if (poin > 0) {
      await tambahPoin({ karyawan_id: r.karyawan_id, pelanggaran_id: r.pelanggaran_id, poin, sumber: "manual", tanggal: r.tanggal_kejadian, laporan_id: r.id });
    }
  }
  return rows.length;
}
