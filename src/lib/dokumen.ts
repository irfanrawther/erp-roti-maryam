// ============================================================
// Definisi 10 slot dokumen kepegawaian.
// Tiap kategori jabatan (Training Produksi, Training Packing,
// Staff Produksi, Staff Packing, SPV) punya 2 dokumen yang
// ditandatangani TERPISAH: Perjanjian Kerja (PK) dan Peraturan
// Perusahaan (PP) — total 5 x 2 = 10 slot independen.
//
// Ini SENGAJA terpisah dari `Jalur` (training/staff/spv) di
// aturan.ts, yang tetap 3-bucket untuk rules engine (telat/izin/
// sakit/poin) — nominal aturan itu sama untuk produksi & packing.
// Dokumen boleh beda konten per kategori meski rules-nya sama.
// ============================================================

export type KategoriDokumen = "training_produksi" | "training_packing" | "staff_produksi" | "staff_packing" | "spv";

export type JenisDokumen = "pk" | "pp";

export interface SlotDokumen {
  jalur: KategoriDokumen; // nama kolom DB tetap "jalur" — isinya sekarang kategori 5-value
  jenis: JenisDokumen;
  nama: string;
  singkat: string;
}

export const SLOT_DOKUMEN: SlotDokumen[] = [
  { jalur: "training_produksi", jenis: "pk", nama: "Perjanjian Kerja — Training Produksi",     singkat: "PK Training Produksi" },
  { jalur: "training_produksi", jenis: "pp", nama: "Peraturan Perusahaan — Training Produksi",  singkat: "PP Training Produksi" },
  { jalur: "training_packing",  jenis: "pk", nama: "Perjanjian Kerja — Training Packing",       singkat: "PK Training Packing" },
  { jalur: "training_packing",  jenis: "pp", nama: "Peraturan Perusahaan — Training Packing",   singkat: "PP Training Packing" },
  { jalur: "staff_produksi",    jenis: "pk", nama: "Perjanjian Kerja — Staff Produksi",         singkat: "PK Staff Produksi" },
  { jalur: "staff_produksi",    jenis: "pp", nama: "Peraturan Perusahaan — Staff Produksi",     singkat: "PP Staff Produksi" },
  { jalur: "staff_packing",     jenis: "pk", nama: "Perjanjian Kerja — Staff Packing",          singkat: "PK Staff Packing" },
  { jalur: "staff_packing",     jenis: "pp", nama: "Peraturan Perusahaan — Staff Packing",      singkat: "PP Staff Packing" },
  { jalur: "spv",               jenis: "pk", nama: "Perjanjian Kerja — Supervisor (SPV)",       singkat: "PK SPV" },
  { jalur: "spv",               jenis: "pp", nama: "Peraturan Perusahaan — Supervisor (SPV)",   singkat: "PP SPV" },
];

export const KATEGORI_DOKUMEN_LIST: KategoriDokumen[] = ["training_produksi", "training_packing", "staff_produksi", "staff_packing", "spv"];

export const JALUR_LABEL_DOK: Record<KategoriDokumen, string> = {
  training_produksi: "Training Produksi",
  training_packing: "Training Packing",
  staff_produksi: "Staff Produksi",
  staff_packing: "Staff Packing",
  spv: "Supervisor (SPV)",
};

export function slotUntukKategori(kategori: KategoriDokumen): SlotDokumen[] {
  return SLOT_DOKUMEN.filter((s) => s.jalur === kategori);
}

export function namaSlot(jalur: string, jenis: string): string {
  return SLOT_DOKUMEN.find((s) => s.jalur === jalur && s.jenis === jenis)?.nama
    ?? (jenis === "gabungan" ? "Dokumen gabungan (arsip)" : `${jalur} ${jenis}`);
}
