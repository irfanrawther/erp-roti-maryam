// ============================================================
// Pasal 3 — Denda Izin (biasa & sakit).
//
// Nominal, poin, dan deadline lapor dibaca dari rules engine
// (aturan_config) dan dipilih berdasarkan TANGGAL KEJADIAN,
// bukan tanggal deploy kode. Tanpa config, fungsi ini memakai
// aturan lama — identik dengan perilaku sebelumnya.
// ============================================================
import {
  IZIN_LAMA, SAKIT_LAMA, hitungIzinBiasa, hitungIzinSakit,
  katLapor as katLaporCfg, jamSebelumByShift,
  type CfgIzin, type CfgSakit, type KatLapor,
} from "@/lib/aturan";

export type { KatLapor };

// jam sebelum shift (deadline lapor) berdasarkan jam masuk shift
export function jamSebelumByMasuk(jamMasuk: string, cfg: CfgIzin | CfgSakit = IZIN_LAMA): number {
  return jamSebelumByShift(jamMasuk, cfg.jam_sebelum_by_shift);
}

// Kategori waktu lapor: bandingkan waktu lapor (ms) dengan deadline & jam shift pada tanggal izin
export function katLapor(
  izinDate: string, jamMasuk: string, reportMs: number, cfg: CfgIzin | CfgSakit = IZIN_LAMA
): KatLapor {
  return katLaporCfg(izinDate, jamMasuk, reportMs, cfg.jam_sebelum_by_shift);
}

// Pasal 3a — Izin biasa. Kuota penuh (Pasal 3c) → + denda tambahan.
export function dendaIzinBiasa(kat: KatLapor, kuotaPenuh: boolean, cfg: CfgIzin = IZIN_LAMA): number {
  return hitungIzinBiasa(cfg, kat, kuotaPenuh).denda;
}
export function poinIzinBiasa(kat: KatLapor, kuotaPenuh: boolean, cfg: CfgIzin = IZIN_LAMA): number {
  return hitungIzinBiasa(cfg, kat, kuotaPenuh).poin;
}

// Pasal 3b — Izin sakit. sakitKe: 1 = pertama bulan ini.
// suratOnTime = surat dokter masuk sebelum batas jam yang ditetapkan.
export function dendaIzinSakit(
  kat: KatLapor, sakitKe: number, suratOnTime: boolean,
  cfgS: CfgSakit = SAKIT_LAMA, cfgI: CfgIzin = IZIN_LAMA, kuotaPenuh = false
): number {
  return hitungIzinSakit(cfgS, cfgI, kat, suratOnTime, kuotaPenuh, sakitKe).denda;
}
export function poinIzinSakit(
  kat: KatLapor, sakitKe: number, suratOnTime: boolean,
  cfgS: CfgSakit = SAKIT_LAMA, cfgI: CfgIzin = IZIN_LAMA, kuotaPenuh = false
): number {
  return hitungIzinSakit(cfgS, cfgI, kat, suratOnTime, kuotaPenuh, sakitKe).poin;
}

export function labelKatLapor(kat: KatLapor): string {
  return kat === "tepat_waktu" ? "Lapor tepat waktu"
    : kat === "telat_sebelum_shift" ? "Lapor telat (sebelum shift mulai)"
    : "Lapor setelah shift mulai";
}
