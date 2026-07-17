// ============================================================
// Pasal 3 — Denda Izin (biasa & sakit) berdasarkan waktu lapor.
// Deadline lapor: Shift 1 = 1 jam sebelum, Shift 2 & 3 = 2 jam, Shift 4 = 3 jam.
// ============================================================

export type KatLapor = "tepat_waktu" | "telat_sebelum_shift" | "setelah_shift";

// jam sebelum shift (deadline lapor) berdasarkan jam masuk shift
export function jamSebelumByMasuk(jamMasuk: string): number {
  const hm = jamMasuk.slice(0, 5);
  if (hm === "06:00") return 1;   // Shift 1
  if (hm === "13:00") return 3;   // Shift 4
  return 2;                        // Shift 2 & 3
}

// Kategori waktu lapor: bandingkan waktu lapor (ms) dengan deadline & jam shift pada tanggal izin
export function katLapor(izinDate: string, jamMasuk: string, reportMs: number): KatLapor {
  const jamSebelum = jamSebelumByMasuk(jamMasuk);
  const shiftStart = new Date(`${izinDate}T${jamMasuk.slice(0, 8).padEnd(8, ":00")}+07:00`).getTime();
  const deadline = shiftStart - jamSebelum * 3600_000;
  if (reportMs <= deadline) return "tepat_waktu";
  if (reportMs < shiftStart) return "telat_sebelum_shift";
  return "setelah_shift";
}

// Pasal 3a — Izin biasa. Kuota penuh (Pasal 3c) → +100.000
export function dendaIzinBiasa(kat: KatLapor, kuotaPenuh: boolean): number {
  let d = kat === "tepat_waktu" ? 150000 : kat === "telat_sebelum_shift" ? 200000 : 300000;
  if (kuotaPenuh) d += 100000;
  return d;
}

// Pasal 3b — Izin sakit. sakitKe: 1 = pertama bulan ini. suratOnTime = surat masuk sebelum 20:00.
export function dendaIzinSakit(kat: KatLapor, sakitKe: number, suratOnTime: boolean): number {
  if (sakitKe === 1 && kat === "tepat_waktu" && suratOnTime) return 0;
  if (kat === "setelah_shift") return 50000;
  return 25000; // tepat_waktu atau telat_sebelum_shift
}

export function labelKatLapor(kat: KatLapor): string {
  return kat === "tepat_waktu" ? "Lapor tepat waktu"
    : kat === "telat_sebelum_shift" ? "Lapor telat (sebelum shift mulai)"
    : "Lapor setelah shift mulai";
}
