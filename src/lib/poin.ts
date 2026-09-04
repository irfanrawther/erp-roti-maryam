// ============================================================
// Sistem Poin Pelanggaran — helper kuartal, tambah poin, cek SP.
// SP akumulatif: tiap +5 poin kuartal berjalan naik 1 level (max SP3).
// ============================================================
import { supabase } from "@/lib/supabase";
import { muatAturan, pilihAturan, cfgTelat, jalurDariKategori, levelSPdariPoin, type CfgSP } from "@/lib/aturan";

// Dipertahankan untuk kompatibilitas tampilan lama (progress bar dashboard).
// Ambang SP yang sebenarnya kini dibaca dari aturan_config.
export const POIN_PER_SP = 5;
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
  absensi_id?: string | null;
}): Promise<void> {
  if (p.poin <= 0 || !p.karyawan_id) return;
  const kuartal = kuartalOf(p.tanggal);
  await supabase.from("poin_karyawan").insert({
    karyawan_id: p.karyawan_id, pelanggaran_id: p.pelanggaran_id, laporan_id: p.laporan_id ?? null,
    poin: p.poin, sumber: p.sumber, tanggal: p.tanggal, kuartal, catatan: p.catatan ?? null,
    absensi_id: p.absensi_id ?? null,
  });
  await cekNaikSP(p.karyawan_id, kuartal, p.tanggal);
}

// Naik SP jika perlu. Ambang dibaca dari aturan_config (default absolut
// 5/10/15 poin kuartal berjalan, sesuai PP Pasal 5 ketiga jalur).
export async function cekNaikSP(karyawan_id: string, kuartal: string, tanggal: string): Promise<void> {
  // total poin kuartal berjalan
  const { data: pRows } = await supabase.from("poin_karyawan").select("poin").eq("karyawan_id", karyawan_id).eq("kuartal", kuartal);
  const poinKuartal = ((pRows as { poin: number }[] | null) ?? []).reduce((s, r) => s + Number(r.poin), 0);

  // SP records
  const { data: spRows } = await supabase.from("status_sp_karyawan").select("level_sp, kuartal_kena").eq("karyawan_id", karyawan_id).eq("is_aktif", true);
  const sps = (spRows as { level_sp: number; kuartal_kena: string }[] | null) ?? [];
  const currentSP = sps.reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const spSebelumKuartal = sps.filter((s) => s.kuartal_kena !== kuartal).reduce((mx, s) => Math.max(mx, s.level_sp), 0);

  const cfg = await cfgSPuntuk(karyawan_id, tanggal);
  const targetSP = levelSPdariPoin(cfg, poinKuartal, spSebelumKuartal);

  if (targetSP > currentSP) {
    const ins = [];
    for (let lvl = currentSP + 1; lvl <= targetSP; lvl++) {
      ins.push({ karyawan_id, level_sp: lvl, poin_saat_kena: poinKuartal, kuartal_kena: kuartal, tanggal_sp: tanggal, is_aktif: true });
    }
    if (ins.length) await supabase.from("status_sp_karyawan").insert(ins);
  }
}

// Config SP sesuai jalur kepegawaian karyawan DAN tanggal kejadian.
// Fallback = perilaku lama (carry-over), dipakai hanya bila aturan_config
// belum termuat, supaya tidak diam-diam berubah jadi aturan baru.
async function cfgSPuntuk(karyawan_id: string, tanggal: string): Promise<CfgSP> {
  const fallback: CfgSP = {
    thresholds: [{ level: 1, poin: 5 }, { level: 2, poin: 10 }, { level: 3, poin: 15 }],
    carry_over_antar_kuartal: true, reset_poin_per_kuartal: true,
    sp_ikut_reset: false, tutup_sp_setelah_kuartal_bersih: 2, phk_otomatis: false,
  };
  const { data: k } = await supabase.from("karyawan").select("kategori_dokumen").eq("id", karyawan_id).maybeSingle();
  const jalur = jalurDariKategori((k as { kategori_dokumen: string | null } | null)?.kategori_dokumen) ?? "training";
  const rows = await muatAturan();
  return pilihAturan<CfgSP>(rows, jalur, "sp", tanggal) ?? fallback;
}

// Poin telat otomatis — kategori & bobot poin dibaca dari aturan_config
// (config-driven, tidak lagi hardcode 0.5/1/3).
export async function poinTelat(karyawan_id: string, kategori: string | null, ampun: boolean, tanggal: string, absensiId?: string | null): Promise<void> {
  if (!kategori || ampun) return;
  const { data: k } = await supabase.from("karyawan").select("kategori_dokumen").eq("id", karyawan_id).maybeSingle();
  const jalur = jalurDariKategori((k as { kategori_dokumen: string | null } | null)?.kategori_dokumen) ?? "training";
  const rows = await muatAturan();
  const cfg = cfgTelat(rows, jalur, tanggal);
  const kat = cfg.kategori.find((c) => c.kode === kategori);
  if (!kat || kat.poin <= 0) return;

  const nama =
    kategori === "K1" ? "Terlambat Kategori 1 (1-15 menit)" :
    kategori === "K2" ? "Terlambat Kategori 2 (16-45 menit)" :
    "Terlambat Kategori 3 (lebih dari 45 menit)";
  const pid = await pelanggaranOtomatisId(nama);
  await tambahPoin({ karyawan_id, pelanggaran_id: pid, poin: kat.poin, sumber: "otomatis", tanggal, absensi_id: absensiId ?? null });
}

// ── Sinkronisasi poin telat saat Super Admin override absensi ──────
// Dipanggil setiap kali admin mengubah hasil akhir suatu baris absensi
// (koreksi jam masuk, hapus denda, ubah jadi izin/alpha, dst). Poin
// telat yang sudah kadung masuk (dari check-in asli, real-time) DIHAPUS
// dulu, lalu diisi ulang persis sesuai hasil akhir yang di-override —
// supaya poin tidak pernah "nyangkut" beda dari keputusan final admin.
export async function sinkronPoinTelat(p: {
  absensi_id: string; karyawan_id: string; tanggal: string;
  kategoriBaru: string | null; ampunBaru: boolean;
}): Promise<void> {
  // Cari & hapus poin telat lama milik baris absensi ini. Untuk baris
  // lama yang dibuat sebelum kolom absensi_id ada, fallback cocokkan
  // via karyawan_id+tanggal+sumber otomatis+kategori telat (aman karena
  // absensi cuma 1 baris per karyawan per tanggal).
  const namaLateness = [
    "Terlambat Kategori 1 (1-15 menit)", "Terlambat Kategori 2 (16-45 menit)", "Terlambat Kategori 3 (lebih dari 45 menit)",
  ];
  const idLateness = (await Promise.all(namaLateness.map((n) => pelanggaranOtomatisId(n)))).filter((x): x is string => !!x);

  const { data: lama } = await supabase.from("poin_karyawan")
    .select("id, absensi_id")
    .eq("karyawan_id", p.karyawan_id).eq("tanggal", p.tanggal).eq("sumber", "otomatis").in("pelanggaran_id", idLateness);
  const lamaRows = (lama as { id: string; absensi_id: string | null }[] | null) ?? [];
  const relevan = lamaRows.filter((r) => r.absensi_id === p.absensi_id || r.absensi_id === null);
  if (relevan.length > 0) {
    await supabase.from("poin_karyawan").delete().in("id", relevan.map((r) => r.id));
  }

  if (p.kategoriBaru && !p.ampunBaru) {
    await poinTelat(p.karyawan_id, p.kategoriBaru, false, p.tanggal, p.absensi_id);
  } else {
    // Tidak ada poin baru — tetap evaluasi ulang SP (poin_karyawan sudah berkurang di atas)
    await evaluasiUlangSP(p.karyawan_id, kuartalOf(p.tanggal), p.tanggal);
  }
}

// Setelah poin_karyawan berkurang (mis. dari sinkronPoinTelat), status
// SP yang sudah aktif bisa jadi tidak lagi didukung total poin kuartal
// berjalan. cekNaikSP() cuma menaikkan (insert-only), jadi perlu fungsi
// terpisah untuk menurunkan/menonaktifkan SP yang sudah tidak berdasar.
export async function evaluasiUlangSP(karyawan_id: string, kuartal: string, tanggal: string): Promise<void> {
  const { data: pRows } = await supabase.from("poin_karyawan").select("poin").eq("karyawan_id", karyawan_id).eq("kuartal", kuartal);
  const poinKuartal = ((pRows as { poin: number }[] | null) ?? []).reduce((s, r) => s + Number(r.poin), 0);

  const { data: spRows } = await supabase.from("status_sp_karyawan").select("id, level_sp, kuartal_kena").eq("karyawan_id", karyawan_id).eq("is_aktif", true);
  const sps = (spRows as { id: string; level_sp: number; kuartal_kena: string }[] | null) ?? [];
  const spSebelumKuartal = sps.filter((s) => s.kuartal_kena !== kuartal).reduce((mx, s) => Math.max(mx, s.level_sp), 0);

  const cfg = await cfgSPuntuk(karyawan_id, tanggal);
  const targetSP = levelSPdariPoin(cfg, poinKuartal, spSebelumKuartal);

  // SP kuartal ini yang levelnya lebih tinggi dari yang seharusnya (setelah poin berkurang) → nonaktifkan
  const berlebih = sps.filter((s) => s.kuartal_kena === kuartal && s.level_sp > targetSP);
  if (berlebih.length > 0) {
    await supabase.from("status_sp_karyawan").update({ is_aktif: false }).in("id", berlebih.map((s) => s.id));
  }
}
