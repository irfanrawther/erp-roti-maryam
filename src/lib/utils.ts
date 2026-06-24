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

// Khusus jumlah bahan baku (kg/liter): selalu tampilkan 3 digit di belakang koma
// supaya presisi gram/ml terbaca penuh, mis. 2,185 kg (bukan 2,18 kg).
export function formatBahan(num: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(num);
}
