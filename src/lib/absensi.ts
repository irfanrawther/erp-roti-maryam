// ============================================================
// Logika denda telat, kategori, flag anomali — Tahap 3 Absensi
//
// Nominal & poin dibaca dari rules engine (aturan_config) dan
// dipilih berdasarkan TANGGAL KEJADIAN, bukan tanggal deploy.
// Nominal di bawah ini tetap ada sebagai fallback bila config
// belum termuat — nilainya sama dengan aturan yang berlaku
// sampai 31 Agustus 2026.
// ============================================================
import { cfgTelat, cfgIzin, TELAT_LAMA, type AturanRows, type CfgTelat, type Jalur } from "@/lib/aturan";

export const DENDA = { K1: 10000, K2: 20000, K3: 30000, ALPHA: 200000 } as const;
// Denda izin manual sementara (sebelum fitur Lapor Izin berjalan)
export const DENDA_IZIN_MANUAL = 50000;
export const JATAH_AMPUN_K1 = 3;       // jatah ampun K1 per bulan
export const KEPAGIAN_LIMIT = 45;      // > 45 menit sebelum shift → flag kepagian
export const JAM_ALPHA = 17;           // lewat 17:00 WIB & tidak check-in → alpha

// Menit dalam hari (WIB) dari sebuah Date
export function wibMinutesOfDay(d: Date): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d); // "HH:MM"
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" / "HH:MM:SS" → menit
export function jamToMinutes(jam: string): number {
  const [h, m] = jam.split(":").map(Number);
  return h * 60 + m;
}

export interface DendaResult {
  menit_telat: number;
  menit_kepagian: number;
  kategori_telat: "K1" | "K2" | "K3" | null;
  denda: number;
  denda_dihapus_ampun: boolean;
  is_flagged: boolean;
  flag_reason: "telat_jauh" | "datang_kepagian" | null;
}

// Hitung denda berdasarkan jam masuk shift, waktu check-in, dan jumlah ampun K1 bulan ini.
//
// `cfg` adalah aturan keterlambatan yang berlaku pada TANGGAL KEJADIAN
// (ambil lewat cfgTelat(rows, jalur, tanggal)). Bila tidak diberikan,
// dipakai aturan lama — sama persis dengan perilaku sebelumnya.
export function hitungDenda(
  jamMasukShift: string, checkin: Date, k1AmpunBulanIni: number, cfg: CfgTelat = TELAT_LAMA
): DendaResult {
  const masuk = jamToMinutes(jamMasukShift);
  const ci    = wibMinutesOfDay(checkin);
  const telat    = Math.max(0, ci - masuk);
  const kepagian = Math.max(0, masuk - ci);

  let kategori: DendaResult["kategori_telat"] = null;
  let denda = 0, ampun = false, flagged = false;
  let flagReason: DendaResult["flag_reason"] = null;

  if (telat >= 1) {
    const kat = cfg.kategori.find(
      (k) => telat >= k.menit_min && (k.menit_maks === null || telat <= k.menit_maks)
    );
    if (kat) {
      kategori = kat.kode as DendaResult["kategori_telat"];
      const isK1 = kat.kode === cfg.kategori[0]?.kode;
      if (isK1 && k1AmpunBulanIni < cfg.dispensasi_k1_per_bulan) {
        denda = 0; ampun = true;                 // dispensasi K1 ke-1..N
      } else {
        denda = kat.denda; ampun = false;
      }
      if (kat.menit_maks === null) { flagged = true; flagReason = "telat_jauh"; }
    }
  }

  // Kepagian ekstrem (hanya saat tidak telat) → flag, tanpa denda
  if (telat === 0 && kepagian > KEPAGIAN_LIMIT) { flagged = true; flagReason = "datang_kepagian"; }

  return {
    menit_telat: telat, menit_kepagian: kepagian, kategori_telat: kategori,
    denda, denda_dihapus_ampun: ampun, is_flagged: flagged, flag_reason: flagReason,
  };
}

// Denda alpha yang berlaku pada tanggal kejadian.
export function dendaAlphaPada(rows: AturanRows, jalur: Jalur, tanggal: string): number {
  return cfgIzin(rows, jalur, tanggal).alpha.denda;
}

// Aturan keterlambatan yang berlaku pada tanggal kejadian.
export function telatPada(rows: AturanRows, jalur: Jalur, tanggal: string): CfgTelat {
  return cfgTelat(rows, jalur, tanggal);
}

// Rentang bulan kalender dari sebuah tanggal "YYYY-MM-DD"
export function bulanRange(tanggal: string): { start: string; end: string } {
  const [y, m] = tanggal.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export const KATEGORI_LABEL: Record<string, string> = {
  K1: "K1 (1-15 mnt)", K2: "K2 (16-45 mnt)", K3: "K3 (>45 mnt)",
};
export const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir", alpha: "Alpha", izin: "Izin", izin_sakit: "Izin Sakit",
};
