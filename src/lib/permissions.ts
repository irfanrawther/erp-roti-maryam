// ============================================================
// Permission / capability system (role + access_scope)
// ============================================================
import type { UserSession } from "./auth";

export type Role = "super_admin" | "spv" | "staff_produksi" | "staff_packing_pengiriman";
export type AccessScope = "adonan_rendam" | "packing" | null;

export interface Capabilities {
  dashboard: boolean;        // halaman Dashboard
  bahanBaku: boolean;        // Produksi → tab Bahan Baku
  produksiFlow: boolean;     // Produksi → tab Alur Produksi (minimal 1 sub-tab)
  adonan: boolean;           // sub-tab Adonan
  rendam: boolean;           // sub-tab Rendam (status 'bikin')
  packingFreezer: boolean;   // sub-tab Packing & Freezer
  produksiRiwayat: boolean;  // sub-tab Riwayat & Laporan Reject (read-only)
  pengiriman: boolean;       // halaman Pengiriman
  kelolaUser: boolean;       // halaman Kelola User
  masterResep: boolean;      // halaman Master Resep Adonan
  isSuperAdmin: boolean;
}

const NONE: Capabilities = {
  dashboard: false, bahanBaku: false, produksiFlow: false,
  adonan: false, rendam: false, packingFreezer: false, produksiRiwayat: false,
  pengiriman: false, kelolaUser: false, masterResep: false, isSuperAdmin: false,
};

export function getCapabilities(user: UserSession | null): Capabilities {
  if (!user) return { ...NONE };
  const role = user.role as Role;
  const scope = (user.access_scope ?? null) as AccessScope;

  // Backward-compat: role lama owner/manager dianggap super_admin
  if (role === "super_admin" || user.role === "owner" || user.role === "manager") {
    return {
      dashboard: true, bahanBaku: true, produksiFlow: true,
      adonan: true, rendam: true, packingFreezer: true, produksiRiwayat: true,
      pengiriman: true, kelolaUser: true, masterResep: true, isSuperAdmin: true,
    };
  }

  if (role === "staff_produksi") {
    return { ...NONE, bahanBaku: true };
  }

  if (role === "staff_packing_pengiriman") {
    return { ...NONE, pengiriman: true };
  }

  if (role === "spv") {
    if (scope === "packing") {
      return { ...NONE, produksiFlow: true, packingFreezer: true, produksiRiwayat: true };
    }
    // default SPV scope = adonan_rendam
    return { ...NONE, produksiFlow: true, adonan: true, rendam: true, produksiRiwayat: true };
  }

  return { ...NONE };
}

// Halaman tujuan setelah login, sesuai role
export function homeRoute(user: UserSession | null): string {
  const caps = getCapabilities(user);
  if (caps.dashboard) return "/dashboard";
  if (caps.bahanBaku || caps.produksiFlow) return "/packing";
  if (caps.pengiriman) return "/pengiriman";
  return "/login";
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "spv", label: "SPV" },
  { value: "staff_produksi", label: "Staff Produksi" },
  { value: "staff_packing_pengiriman", label: "Staff Packing Pengiriman" },
  { value: "super_admin", label: "Super Admin" },
];

export const SCOPE_OPTIONS: { value: Exclude<AccessScope, null>; label: string }[] = [
  { value: "adonan_rendam", label: "Adonan & Rendam" },
  { value: "packing", label: "Packing & Freezer" },
];
