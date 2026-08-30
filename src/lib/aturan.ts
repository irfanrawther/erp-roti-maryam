// ============================================================
// Rules engine — SELURUH angka aturan dibaca dari tabel
// aturan_config di Supabase, bukan hardcode. Lihat migration
// 062_rules_engine.sql untuk struktur & nilai awal.
//
// Sumber aturan: PK + PP Training / Staff / SPV.
// ============================================================
import { supabase } from "@/lib/supabase";

export type Jalur = "training" | "staff" | "spv";
export type KatLapor = "tepat_waktu" | "telat_sebelum_shift" | "setelah_shift";

export const JALUR_LABEL: Record<Jalur, string> = {
  training: "Training",
  staff: "Staff",
  spv: "SPV",
};

// ── Tipe config (longgar — nilainya JSONB yang bisa diedit admin) ──
export interface KategoriTelat {
  kode: string; menit_min: number; menit_maks: number | null; poin: number; denda: number;
}
export interface CfgTelat {
  dispensasi_k1_per_bulan: number;
  destinasi_denda: "bonus_vesting" | "tunjangan_kerajinan";
  kategori: KategoriTelat[];
}
export interface TarifLapor { denda: number; poin: number }
export interface CfgIzin {
  jam_sebelum_by_shift: Record<string, number>;
  tepat_waktu: TarifLapor; telat_sebelum_shift: TarifLapor; setelah_shift: TarifLapor;
  alpha: TarifLapor;
  kuota_izin_per_hari: number;
  denda_tambahan_kuota_penuh: number;
  destinasi_denda: string;
}
export interface CfgSakit {
  jam_sebelum_by_shift: Record<string, number>;
  batas_kirim_surat_jam: string;
  tepat_waktu_bersurat: TarifLapor; telat_sebelum_shift: TarifLapor; setelah_shift: TarifLapor;
  bebas_denda_berlaku_semua_kejadian: boolean;
  tanpa_surat_ikut_aturan_izin: boolean;
  tambahan_poin_sakit_berulang: { mulai_kejadian_ke: number; poin: number; maks_per_bulan: number };
  destinasi_denda: string;
}
export interface CfgSP {
  thresholds: { level: number; poin: number }[];
  carry_over_antar_kuartal: boolean;
  reset_poin_per_kuartal: boolean;
  sp_ikut_reset: boolean;
  tutup_sp_setelah_kuartal_bersih: number;
  phk_otomatis: boolean;
  sp2_hanguskan_tunjangan_prestasi?: boolean;
}
export interface CfgVesting {
  tahap: { tahap: number; nominal: number; hari_kalender: number }[];
  mundur_hari_per_ketidakhadiran: number;
  bayar_hari_kerja_berikutnya: boolean;
  grace_phk_hari_kalender: number;
  hangus_saat_resign: boolean;
}
export interface KomponenTunjangan {
  nominal: number; prorata: boolean;
  minimum_nol?: boolean; sisa_denda_jadi_utang?: boolean;
  hangus_jika_sp2_periode_ini?: boolean;
  hangus_pada_pelanggaran_kebersihan_ke?: number;
}
export interface CfgKompensasi {
  upah_pokok: number;
  hari_standar: number;
  hari_hadir_dihitung: string;
  masa_training_hari_kalender?: number;
  tunjangan_kerajinan?: KomponenTunjangan;
  tunjangan_prestasi?: KomponenTunjangan;
  tunjangan_kebersihan?: KomponenTunjangan;
  tunjangan_loyalitas?: {
    nominal_setelah_12_bulan: number; nominal_setelah_24_bulan: number;
    prorata: boolean; min_kehadiran_persen: number; basis_kehadiran: string;
    hangus_jika_tolak_bimbing_training: boolean;
  };
  bonus_spv?: { nominal: number; prorata: boolean; bersyarat: boolean };
  bonus_lebaran?: {
    per_bulan_kerja_penuh: number; maks_per_tahun: number;
    min_masa_kerja_bulan: number; basis_bulan: string;
  };
}

export interface AturanJalur {
  telat: CfgTelat;
  izin: CfgIzin;
  sakit: CfgSakit;
  sp: CfgSP;
  kompensasi: CfgKompensasi;
  vesting?: CfgVesting;
  kasbon?: Record<string, unknown>;
  plt_spv?: Record<string, unknown>;
  jadwal_tugas?: Record<string, unknown>;
}

export type SemuaAturan = Record<string, Record<string, unknown>>;

// ── Aturan berlaku-per-tanggal ──────────────────────────────
// Satu (jalur, kunci) bisa punya beberapa versi dengan berlaku_mulai
// berbeda. Pemilihan versi memakai TANGGAL KEJADIAN pelanggaran,
// bukan tanggal kode di-deploy — jadi periode gaji yang sedang
// berjalan tidak ikut berubah saat aturan baru mulai berlaku.
export interface ConfigRow {
  jalur: string; kunci: string; nilai: unknown; berlaku_mulai: string;
}
export type AturanRows = ConfigRow[];

let cache: AturanRows | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function muatAturan(force = false): Promise<AturanRows> {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;
  const { data } = await supabase
    .from("aturan_config")
    .select("jalur, kunci, nilai, berlaku_mulai")
    .order("berlaku_mulai", { ascending: true });
  cache = (data as AturanRows | null) ?? [];
  cacheAt = Date.now();
  return cache;
}

export function invalidateAturanCache() { cache = null; }

// Versi yang berlaku pada `tanggal` (YYYY-MM-DD) = berlaku_mulai
// terbesar yang <= tanggal. null kalau tidak ada versi yang cocok.
export function pilihAturan<T>(
  rows: AturanRows, jalur: Jalur | "global", kunci: string, tanggal: string
): T | null {
  let pilih: ConfigRow | null = null;
  for (const r of rows) {
    if (r.jalur !== jalur || r.kunci !== kunci) continue;
    if (r.berlaku_mulai > tanggal) continue;
    if (!pilih || r.berlaku_mulai > pilih.berlaku_mulai) pilih = r;
  }
  return pilih ? (pilih.nilai as T) : null;
}

// Ambil config lengkap satu jalur pada tanggal tertentu.
export function aturanJalurPada(rows: AturanRows, jalur: Jalur, tanggal: string): Partial<AturanJalur> {
  const out: Record<string, unknown> = {};
  const kunci = new Set(rows.filter((r) => r.jalur === jalur).map((r) => r.kunci));
  kunci.forEach((k) => {
    const v = pilihAturan<unknown>(rows, jalur, k, tanggal);
    if (v !== null) out[k] = v;
  });
  return out as Partial<AturanJalur>;
}

// Tanggal hari ini di WIB — dipakai sebagai default "tanggal kejadian".
export function hariIniWIB(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ── Fallback: nominal LAMA (berlaku s/d 31 Agustus 2026) ────
// Dipakai hanya bila tabel aturan_config belum termuat/kosong, supaya
// perhitungan tidak pernah jatuh ke angka nol atau angka baru secara
// diam-diam. Nilainya identik dengan perilaku produksi sebelum
// rules engine dipasang.
export const TELAT_LAMA: CfgTelat = {
  dispensasi_k1_per_bulan: 3,
  destinasi_denda: "tunjangan_kerajinan",
  kategori: [
    { kode: "K1", menit_min: 1,  menit_maks: 15,   poin: 0.5, denda: 10000 },
    { kode: "K2", menit_min: 16, menit_maks: 45,   poin: 1,   denda: 20000 },
    { kode: "K3", menit_min: 46, menit_maks: null, poin: 3,   denda: 30000 },
  ],
};
const DEADLINE_LAMA = { "06:00": 1, "08:00": 2, "10:00": 2, "13:00": 3 };
export const IZIN_LAMA: CfgIzin = {
  jam_sebelum_by_shift: DEADLINE_LAMA,
  tepat_waktu:         { denda: 150000, poin: 0 },
  telat_sebelum_shift: { denda: 200000, poin: 0 },
  setelah_shift:       { denda: 300000, poin: 0 },
  alpha:               { denda: 200000, poin: 5 },
  kuota_izin_per_hari: 1,
  denda_tambahan_kuota_penuh: 100000,
  destinasi_denda: "denda_tunai",
};
export const SAKIT_LAMA: CfgSakit = {
  jam_sebelum_by_shift: DEADLINE_LAMA,
  batas_kirim_surat_jam: "20:00",
  tepat_waktu_bersurat: { denda: 0,     poin: 0 },
  telat_sebelum_shift:  { denda: 25000, poin: 0 },
  setelah_shift:        { denda: 50000, poin: 0 },
  bebas_denda_berlaku_semua_kejadian: false,
  tanpa_surat_ikut_aturan_izin: false,
  tambahan_poin_sakit_berulang: { mulai_kejadian_ke: 9999, poin: 0, maks_per_bulan: 0 },
  destinasi_denda: "denda_tunai",
};

// Selector dengan fallback aman.
export function cfgTelat(rows: AturanRows, jalur: Jalur, tanggal: string): CfgTelat {
  return pilihAturan<CfgTelat>(rows, jalur, "telat", tanggal) ?? TELAT_LAMA;
}
export function cfgIzin(rows: AturanRows, jalur: Jalur, tanggal: string): CfgIzin {
  return pilihAturan<CfgIzin>(rows, jalur, "izin", tanggal) ?? IZIN_LAMA;
}
export function cfgSakit(rows: AturanRows, jalur: Jalur, tanggal: string): CfgSakit {
  return pilihAturan<CfgSakit>(rows, jalur, "sakit", tanggal) ?? SAKIT_LAMA;
}

// kategori_dokumen ("training_produksi" / "staff_packing" / "spv") → jalur kepegawaian
export function jalurDariKategori(kategori: string | null | undefined): Jalur | null {
  if (!kategori) return null;
  if (kategori.startsWith("training")) return "training";
  if (kategori.startsWith("staff")) return "staff";
  if (kategori === "spv") return "spv";
  return null;
}

// ── Keterlambatan (PP Pasal 2) ──────────────────────────────
export interface HasilTelat {
  kategori: string | null; poin: number; denda: number; ampun: boolean;
}
export function hitungTelat(cfg: CfgTelat, menitTelat: number, k1AmpunTerpakai: number): HasilTelat {
  if (menitTelat < 1) return { kategori: null, poin: 0, denda: 0, ampun: false };
  const kat = cfg.kategori.find(
    (k) => menitTelat >= k.menit_min && (k.menit_maks === null || menitTelat <= k.menit_maks)
  );
  if (!kat) return { kategori: null, poin: 0, denda: 0, ampun: false };
  // Dispensasi: K1 sampai N kali per bulan = 0 poin & 0 denda
  const isK1 = kat.kode === cfg.kategori[0]?.kode;
  if (isK1 && k1AmpunTerpakai < cfg.dispensasi_k1_per_bulan) {
    return { kategori: kat.kode, poin: 0, denda: 0, ampun: true };
  }
  return { kategori: kat.kode, poin: kat.poin, denda: kat.denda, ampun: false };
}

// ── Kategori waktu lapor izin/sakit (PP Pasal 3) ────────────
export function jamSebelumByShift(jamMasuk: string, map: Record<string, number>): number {
  return map[jamMasuk.slice(0, 5)] ?? 2;
}
export function katLapor(
  tanggalIzin: string, jamMasuk: string, waktuLaporMs: number, map: Record<string, number>
): KatLapor {
  const jamSebelum = jamSebelumByShift(jamMasuk, map);
  const shiftStart = new Date(`${tanggalIzin}T${jamMasuk.slice(0, 5)}:00+07:00`).getTime();
  const deadline = shiftStart - jamSebelum * 3600_000;
  if (waktuLaporMs <= deadline) return "tepat_waktu";
  if (waktuLaporMs < shiftStart) return "telat_sebelum_shift";
  return "setelah_shift";
}

// ── Izin biasa (PP Pasal 3a) ────────────────────────────────
export function hitungIzinBiasa(cfg: CfgIzin, kat: KatLapor, kuotaPenuh: boolean): TarifLapor {
  const t = cfg[kat];
  return {
    denda: t.denda + (kuotaPenuh ? cfg.denda_tambahan_kuota_penuh : 0),
    poin: t.poin,
  };
}

// ── Izin sakit (PP Pasal 3b) ────────────────────────────────
// suratOnTime = surat dokter masuk sebelum batas_kirim_surat_jam.
// Baris "bebas denda" hanya berlaku bila lapor tepat waktu DAN bersurat.
// bebas_denda_berlaku_semua_kejadian menentukan apakah pembebasan itu
// berlaku untuk sakit ke-2 dst (aturan baru) atau hanya sakit pertama
// (aturan lama).
export function hitungIzinSakit(
  cfgSakit: CfgSakit, cfgIzin: CfgIzin, kat: KatLapor,
  suratOnTime: boolean, kuotaPenuh: boolean, sakitKe = 1
): TarifLapor {
  if (!suratOnTime && cfgSakit.tanpa_surat_ikut_aturan_izin) {
    return hitungIzinBiasa(cfgIzin, kat, kuotaPenuh);
  }
  if (kat === "tepat_waktu") {
    const bebas = suratOnTime && (sakitKe === 1 || cfgSakit.bebas_denda_berlaku_semua_kejadian);
    return bebas ? { ...cfgSakit.tepat_waktu_bersurat } : { ...cfgSakit.telat_sebelum_shift };
  }
  return { ...cfgSakit[kat] };
}

// Tambahan poin sakit ke-N dst — berlaku maks sekali per bulan.
export function tambahanPoinSakitBerulang(cfg: CfgSakit, sakitKeBerapa: number, sudahKenaBulanIni: boolean): number {
  const r = cfg.tambahan_poin_sakit_berulang;
  if (!r || sudahKenaBulanIni) return 0;
  return sakitKeBerapa >= r.mulai_kejadian_ke ? r.poin : 0;
}

// ── Surat Peringatan (PP Pasal 5) ───────────────────────────
// Ambang ABSOLUT dari poin kuartal berjalan (tanpa carry-over),
// kecuali config carry_over_antar_kuartal di-set true.
export function levelSPdariPoin(cfg: CfgSP, poinKuartal: number, spKuartalSebelumnya = 0): number {
  const tercapai = cfg.thresholds
    .filter((t) => poinKuartal >= t.poin)
    .reduce((mx, t) => Math.max(mx, t.level), 0);
  if (!cfg.carry_over_antar_kuartal) return tercapai;
  const maxLevel = cfg.thresholds.reduce((mx, t) => Math.max(mx, t.level), 0);
  return Math.min(maxLevel, spKuartalSebelumnya + tercapai);
}

// ── Bonus Vesting Training (PK Training Pasal 5) ────────────
export interface TahapVesting {
  tahap: number; nominal: number;
  hariKalender: number;      // target awal
  targetAwal: string;        // YYYY-MM-DD
  targetAktual: string;      // setelah mundur karena ketidakhadiran
  mundurHari: number;
  potongan: number;
  nominalAkhir: number;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// tanggalTidakHadir: daftar tanggal (YYYY-MM-DD) karyawan tidak hadir dengan alasan apapun.
// totalDenda: akumulasi Denda Rupiah telat + izin/sakit selama masa training.
export function jadwalVesting(
  cfg: CfgVesting, tanggalMulai: string, tanggalTidakHadir: string[], totalDenda = 0
): TahapVesting[] {
  const absen = tanggalTidakHadir.filter((d, i, a) => a.indexOf(d) === i).sort();
  const hasil: TahapVesting[] = [];
  let sisaPotongan = totalDenda;

  for (const t of [...cfg.tahap].sort((a, b) => a.hari_kalender - b.hari_kalender)) {
    const targetAwal = addDays(tanggalMulai, t.hari_kalender);
    // Setiap 1 hari tidak hadir SEBELUM target menggeser target maju 1 hari.
    // Digeser iteratif karena pergeseran bisa memasukkan hari absen baru ke dalam rentang.
    let target = targetAwal;
    let mundur = 0;
    for (let guard = 0; guard < 400; guard++) {
      const jml = absen.filter((d) => d <= target).length;
      if (jml === mundur) break;
      mundur = jml;
      target = addDays(targetAwal, mundur * cfg.mundur_hari_per_ketidakhadiran);
    }
    const potongan = Math.min(sisaPotongan, t.nominal);
    sisaPotongan -= potongan;
    hasil.push({
      tahap: t.tahap, nominal: t.nominal, hariKalender: t.hari_kalender,
      targetAwal, targetAktual: target, mundurHari: mundur,
      potongan, nominalAkhir: t.nominal - potongan,
    });
  }
  return hasil;
}

// ── Kompensasi bulanan Staff / SPV (PK Pasal 3) ─────────────
export interface InputTunjangan {
  hariHadir: number;              // hari check-in fisik pada periode
  hariKerjaKalender: number;      // jumlah hari Senin–Sabtu pada periode (basis syarat loyalitas)
  totalDenda: number;             // Denda Rupiah telat + izin/sakit pada periode
  punyaSP2PeriodeIni: boolean;
  pelanggaranKebersihan: number;  // jumlah pelanggaran kebersihan pada periode
  masaKerjaBulan: number;
  tolakBimbingTraining: boolean;
  utangSebelumnya?: number;       // sisa denda periode lalu yang belum tertutup
}
export interface RincianKompensasi {
  upahPokok: number;
  kerajinan: number;
  prestasi: number;
  kebersihan: number;
  loyalitas: number;
  bonusSpv: number;
  total: number;
  sisaDendaJadiUtang: number;
  catatan: string[];
}

export function hitungKompensasi(cfg: CfgKompensasi, inp: InputTunjangan): RincianKompensasi {
  const catatan: string[] = [];
  const H = cfg.hari_standar || 26;
  const rate = (nominal: number) => Math.round((nominal / H) * inp.hariHadir);

  // Upah Pokok — unconditional, prorata hari hadir
  const upahPokok = rate(cfg.upah_pokok);

  // Tunjangan Kerajinan — prorata lalu dikurangi Denda Rupiah, minimum 0
  let kerajinan = 0, sisaDendaJadiUtang = 0;
  if (cfg.tunjangan_kerajinan) {
    const dasar = rate(cfg.tunjangan_kerajinan.nominal);
    const totalDenda = inp.totalDenda + (inp.utangSebelumnya ?? 0);
    kerajinan = dasar - totalDenda;
    if (kerajinan < 0) {
      sisaDendaJadiUtang = -kerajinan;
      kerajinan = 0;
      catatan.push(`Denda melebihi Tunjangan Kerajinan — sisa Rp${sisaDendaJadiUtang.toLocaleString("id-ID")} jadi utang periode berikutnya.`);
    }
  }

  // Tunjangan Prestasi Kerja — hangus penuh jika SP2 terbit pada periode ini
  let prestasi = 0;
  if (cfg.tunjangan_prestasi) {
    if (cfg.tunjangan_prestasi.hangus_jika_sp2_periode_ini && inp.punyaSP2PeriodeIni) {
      prestasi = 0;
      catatan.push("Tunjangan Prestasi Kerja hangus: SP2 terbit pada periode ini.");
    } else {
      prestasi = rate(cfg.tunjangan_prestasi.nominal);
    }
  }

  // Tunjangan Kebersihan — hangus jika pelanggaran kebersihan mencapai ambang
  let kebersihan = 0;
  if (cfg.tunjangan_kebersihan) {
    const ambang = cfg.tunjangan_kebersihan.hangus_pada_pelanggaran_kebersihan_ke ?? 3;
    if (inp.pelanggaranKebersihan >= ambang) {
      kebersihan = 0;
      catatan.push(`Tunjangan Kebersihan hangus: pelanggaran kebersihan ke-${inp.pelanggaranKebersihan} (ambang ${ambang}).`);
    } else {
      kebersihan = rate(cfg.tunjangan_kebersihan.nominal);
    }
  }

  // Tunjangan Loyalitas — tidak diprorata, syarat masa kerja + kehadiran + tidak menolak bimbing
  let loyalitas = 0;
  const L = cfg.tunjangan_loyalitas;
  if (L) {
    const nominal = inp.masaKerjaBulan > 24 ? L.nominal_setelah_24_bulan
                  : inp.masaKerjaBulan > 12 ? L.nominal_setelah_12_bulan : 0;
    if (nominal === 0) {
      catatan.push("Tunjangan Loyalitas belum berlaku: masa kerja belum lebih dari 12 bulan.");
    } else if (L.hangus_jika_tolak_bimbing_training && inp.tolakBimbingTraining) {
      catatan.push("Tunjangan Loyalitas hangus: menolak penugasan membimbing karyawan training.");
    } else {
      const persen = inp.hariKerjaKalender > 0 ? (inp.hariHadir / inp.hariKerjaKalender) * 100 : 0;
      if (persen < L.min_kehadiran_persen) {
        catatan.push(`Tunjangan Loyalitas hangus: kehadiran ${persen.toFixed(1)}% < ${L.min_kehadiran_persen}%.`);
      } else {
        loyalitas = nominal;
      }
    }
  }

  // Bonus SPV — tetap, tidak diprorata, tidak bersyarat
  const bonusSpv = cfg.bonus_spv ? cfg.bonus_spv.nominal : 0;

  const total = upahPokok + kerajinan + prestasi + kebersihan + loyalitas + bonusSpv;
  return { upahPokok, kerajinan, prestasi, kebersihan, loyalitas, bonusSpv, total, sisaDendaJadiUtang, catatan };
}

// ── Bonus Lebaran (PK Pasal 3 ayat 8/9) ─────────────────────
// "Bulan kerja penuh" dihitung dari TANGGAL MULAI KERJA
// (mis. mulai 15 Jan → bulan penuh ke-1 selesai 14 Feb).
export function bulanKerjaPenuh(tanggalMulai: string, sampai: string): number {
  const a = new Date(`${tanggalMulai}T00:00:00+07:00`);
  const b = new Date(`${sampai}T00:00:00+07:00`);
  let n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) n -= 1;
  return Math.max(0, n);
}

export function hitungBonusLebaran(
  cfg: NonNullable<CfgKompensasi["bonus_lebaran"]>, tanggalMulai: string, tanggalBayar: string
): { berhak: boolean; bulan: number; nominal: number; alasan: string } {
  const bulan = bulanKerjaPenuh(tanggalMulai, tanggalBayar);
  if (bulan < cfg.min_masa_kerja_bulan) {
    return { berhak: false, bulan, nominal: 0,
      alasan: `Masa kerja ${bulan} bulan < syarat ${cfg.min_masa_kerja_bulan} bulan.` };
  }
  const nominal = Math.min(cfg.maks_per_tahun, bulan * cfg.per_bulan_kerja_penuh);
  return { berhak: true, bulan, nominal, alasan: `${bulan} bulan kerja penuh × Rp${cfg.per_bulan_kerja_penuh.toLocaleString("id-ID")}` };
}

// ── Util periode ────────────────────────────────────────────
// Jumlah hari kerja kalender (Senin–Sabtu) dalam satu bulan.
export function hariKerjaKalender(tahun: number, bulan1_12: number): number {
  const total = new Date(tahun, bulan1_12, 0).getDate();
  let n = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(tahun, bulan1_12 - 1, d).getDay() !== 0) n++; // 0 = Minggu
  }
  return n;
}
