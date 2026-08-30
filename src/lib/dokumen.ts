// ============================================================
// Definisi 6 slot dokumen kepegawaian.
// Tiap jalur punya 2 dokumen yang ditandatangani TERPISAH:
// Perjanjian Kerja (PK) dan Peraturan Perusahaan (PP).
// ============================================================
import type { Jalur } from "@/lib/aturan";

export type JenisDokumen = "pk" | "pp";

export interface SlotDokumen {
  jalur: Jalur;
  jenis: JenisDokumen;
  nama: string;
  singkat: string;
}

export const SLOT_DOKUMEN: SlotDokumen[] = [
  { jalur: "training", jenis: "pk", nama: "Perjanjian Kerja — Masa Training",    singkat: "PK Training" },
  { jalur: "training", jenis: "pp", nama: "Peraturan Perusahaan — Masa Training", singkat: "PP Training" },
  { jalur: "staff",    jenis: "pk", nama: "Perjanjian Kerja — Staff Produksi",    singkat: "PK Staff" },
  { jalur: "staff",    jenis: "pp", nama: "Peraturan Perusahaan — Staff Produksi", singkat: "PP Staff" },
  { jalur: "spv",      jenis: "pk", nama: "Perjanjian Kerja — Supervisor (SPV)",   singkat: "PK SPV" },
  { jalur: "spv",      jenis: "pp", nama: "Peraturan Perusahaan — Supervisor (SPV)", singkat: "PP SPV" },
];

export const JALUR_LABEL_DOK: Record<Jalur, string> = {
  training: "Masa Training",
  staff: "Staff Produksi",
  spv: "Supervisor (SPV)",
};

export function slotUntukJalur(jalur: Jalur): SlotDokumen[] {
  return SLOT_DOKUMEN.filter((s) => s.jalur === jalur);
}

export function namaSlot(jalur: string, jenis: string): string {
  return SLOT_DOKUMEN.find((s) => s.jalur === jalur && s.jenis === jenis)?.nama
    ?? (jenis === "gabungan" ? "Dokumen gabungan (arsip)" : `${jalur} ${jenis}`);
}
