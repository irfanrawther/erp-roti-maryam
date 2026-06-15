// Hash & login dilakukan di server (/api/auth/login) menggunakan Node.js crypto
// sehingga works di HTTP maupun HTTPS (crypto.subtle hanya tersedia di HTTPS)
export async function loginWithPin(pin: string, role?: string) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, role }),
    });
    const json = await res.json() as { user?: UserSession; error?: string };
    if (!res.ok) return { user: null, error: json.error ?? "Login gagal" };
    return { user: json.user ?? null, error: null };
  } catch {
    return { user: null, error: "Tidak dapat terhubung ke server" };
  }
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
  access_scope?: string | null;
};

// Hash PIN di server (Node crypto) — works di HTTP maupun HTTPS.
// Dipakai oleh halaman Kelola User saat membuat/mengubah PIN.
export async function hashPin(pin: string): Promise<string> {
  const res = await fetch(`/api/auth/hash?pin=${encodeURIComponent(pin)}`);
  const json = (await res.json()) as { hash?: string };
  return json.hash ?? "";
}

export function canAccessAdmin(role: string) {
  return role === "super_admin" || role === "owner" || role === "manager";
}

export function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    spv: "SPV",
    staff_produksi: "Staff Produksi",
    staff_packing_pengiriman: "Staff Packing Pengiriman",
    // role lama (backward-compat)
    owner: "Super Admin",
    manager: "Super Admin",
    spv_pagi: "SPV",
    spv_siang: "SPV",
    staff: "Staff Produksi",
  };
  return labels[role] ?? role;
}

export function getScopeLabel(scope?: string | null) {
  if (scope === "adonan_rendam") return "Adonan & Rendam";
  if (scope === "packing") return "Packing & Freezer";
  return "";
}
