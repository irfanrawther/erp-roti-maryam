import { supabase } from "./supabase";

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loginWithPin(pin: string) {
  const pinHash = await hashPin(pin);

  // 1. Cari user berdasarkan hash saja dulu (tanpa filter aktif)
  //    supaya kita bisa bedakan: "hash tidak ada" vs "akun nonaktif"
  const { data: rows, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("pin_hash", pinHash);

  if (fetchError) {
    console.error("[loginWithPin] Supabase error:", fetchError);
    return { user: null, error: `DB error: ${fetchError.message}` };
  }

  if (!rows || rows.length === 0) {
    console.warn("[loginWithPin] Hash tidak ditemukan:", pinHash);
    return { user: null, error: "PIN salah" };
  }

  const user = rows[0];

  if (!user.aktif) {
    return { user: null, error: "Akun Anda sudah dinonaktifkan" };
  }

  return { user, error: null };
}

export function saveUserSession(user: UserSession) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("erp_user", JSON.stringify(user));
  }
}

export function getUserSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const data = sessionStorage.getItem("erp_user");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearUserSession() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("erp_user");
  }
}

export type UserSession = {
  id: string;
  nama: string;
  role: string;
};

export function canAccessAdmin(role: string) {
  return role === "owner" || role === "manager";
}

export function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    spv_pagi: "SPV Pagi",
    spv_siang: "SPV Siang",
    staff: "Staff",
  };
  return labels[role] ?? role;
}
