// ============================================================
// Sistem Poin Pelanggaran — helper kuartal, tambah poin, cek SP.
// SP akumulatif: tiap +5 poin kuartal berjalan naik 1 level (max SP3).
// ============================================================
import { supabase } from "@/lib/supabase";

export const POIN_PER_SP = 5;   // tiap 5 poin naik 1 level SP
export const SP_MAX = 3;

// "2026-07-18" → "2026-Q3"
export function kuartalOf(tanggalISO: string): string {
  const [y, m] = tanggalISO.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}
export function kuartalSekarang(): string {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return kuartalOf(now);
}
export function labelKuartal(k: string): string {
  const [y, q] = k.split("-Q");
  const range: Record<string, string> = { "1": "Jan–Mar", "2": "Apr–Jun", "3": "Jul–Sep", "4": "Okt–Des" };
  return `${range[q] ?? ""} ${y}`;
}

// Ambil id master pelanggaran otomatis berdasarkan nama (cache sederhana)
const idCache: Record<string, string> = {};
export async function pelanggaranOtomatisId(nama: string): Promise<string | null> {
  if (idCache[nama]) return idCache[nama];
  const { data } = await supabase.from("master_pelanggaran").select("id").eq("nama_pelanggaran", nama).eq("jenis", "otomatis").maybeSingle();
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) idCache[nama] = id;
  return id;
}

// Insert poin + cek kenaikan SP
export async function tambahPoin(p: {
  karyawan_id: string; pelanggaran_id: string | null; poin: number;
  sumber: "manual" | "otomatis"; tanggal: string; laporan_id?: string | null; catatan?: string | null;
}): Promise<void> {
  if (p.poin <= 0 || !p.karyawan_id) return;
  const kuartal = kuartalOf(p.tanggal);
  await supabase.from("poin_karyawan").insert({
    karyawan_id: p.karyawan_id, pelanggaran_id: p.pelanggaran_id, laporan_id: p.laporan_id ?? null,
    poin: p.poin, sumber: p.sumber, tanggal: p.tanggal, kuartal, catatan: p.catatan ?? null,
  });
  await cekNaikSP(p.karyawan_id, kuartal, p.tanggal);
}

// Naik SP jika perlu. targetSP = spSebelumKuartal + floor(poinKuartal/5), max 3.
export async function cekNaikSP(karyawan_id: string, kuartal: string, tanggal: string): Promise<void> {
  // total poin kuartal berjalan
  const { data: pRows } = await supabase.from("poin_karyawan").select("poin").eq("karyawan_id", karyawan_id).eq("kuartal", kuartal);
  const poinKuartal = ((pRows as { poin: number }[] | null) ?? []).reduce((s, r) => s + Number(r.poin), 0);

  // SP records
  const { data: spRows } = await supabase.from("status_sp_karyawan").select("level_sp, kuartal_kena").eq("karyawan_id", karyawan_id).eq("is_aktif", true);
  const sps = (spRows as { level_sp: number; kuartal_kena: string }[] | null) ?? [];
  const currentSP = sps.reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const spSebelumKuartal = sps.filter((s) => s.kuartal_kena !== kuartal).reduce((mx, s) => Math.max(mx, s.level_sp), 0);

  const targetSP = Math.min(SP_MAX, spSebelumKuartal + Math.floor(poinKuartal / POIN_PER_SP));
  if (targetSP > currentSP) {
    const ins = [];
    for (let lvl = currentSP + 1; lvl <= targetSP; lvl++) {
      ins.push({ karyawan_id, level_sp: lvl, poin_saat_kena: poinKuartal, kuartal_kena: kuartal, tanggal_sp: tanggal, is_aktif: true });
    }
    if (ins.length) await supabase.from("status_sp_karyawan").insert(ins);
  }
}

// Poin telat: K1 (kecuali ampun) 0.5, K2 1, K3 3
export async function poinTelat(karyawan_id: string, kategori: string | null, ampun: boolean, tanggal: string): Promise<void> {
  if (!kategori) return;
  let poin = 0, nama = "";
  if (kategori === "K1") { if (ampun) return; poin = 0.5; nama = "Terlambat Kategori 1 (1-15 menit)"; }
  else if (kategori === "K2") { poin = 1; nama = "Terlambat Kategori 2 (16-45 menit)"; }
  else if (kategori === "K3") { poin = 3; nama = "Terlambat Kategori 3 (lebih dari 45 menit)"; }
  else return;
  const pid = await pelanggaranOtomatisId(nama);
  await tambahPoin({ karyawan_id, pelanggaran_id: pid, poin, sumber: "otomatis", tanggal });
}
