import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTanggal(date: string | Date) {
  return format(new Date(date), "dd MMM yyyy", { locale: id });
}

export function formatWaktu(date: string | Date) {
  return format(new Date(date), "HH:mm", { locale: id });
}

export function formatTanggalWaktu(date: string | Date) {
  return format(new Date(date), "dd MMM yyyy HH:mm", { locale: id });
}

export function formatAngka(num: number) {
  return new Intl.NumberFormat("id-ID").format(num);
}

// Khusus jumlah bahan baku: satuan berat/volume (kg/liter) selalu tampil 3 digit
// di belakang koma supaya presisi gram/ml terbaca penuh, mis. 2,185 kg.
// Satuan hitungan (pcs/butir/biji/buah) tampil utuh tanpa desimal, mis. 12 pcs.
export function formatBahan(num: number, satuan?: string) {
  const s = (satuan ?? "").toLowerCase().trim();
  const isHitungan = ["pcs", "butir", "biji", "buah"].includes(s);
  if (isHitungan) return new Intl.NumberFormat("id-ID").format(num);
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(num);
}
