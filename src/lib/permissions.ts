// ============================================================
// Permission / capability system (role + access_scope)
// ============================================================
import type { UserSession } from "./auth";

export type Role = "super_admin" | "spv" | "staff_produksi" | "staff_packing_pengiriman" | "pic";
export type AccessScope = "adonan_rendam" | "packing" | null;

export interface Capabilities {
  dashboard: boolean;
  bahanBaku: boolean;
  produksiFlow: boolean;
  adonan: boolean;
  rendam: boolean;
  packingFreezer: boolean;
  produksiRiwayat: boolean;
  pengiriman: boolean;
  produkReject: boolean;  // halaman Produk Reject (jual ke Olmoz Store)
  kelolaUser: boolean;
  masterResep: boolean;
  stockOpname: boolean;   // halaman Stock Opname (PIC + Super Admin)
  absensi: boolean;       // halaman Absensi (Super Admin only, tahap 1)
  daftarIzin: boolean;    // halaman Daftar Izin read-only (SPV)
  isSuperAdmin: boolean;
}

const NONE: Capabilities = {
  dashboard: false, bahanBaku: false, produksiFlow: false,
  adonan: false, rendam: false, packingFreezer: false, produksiRiwayat: false,
  pengiriman: false, produkReject: false, kelolaUser: false, masterResep: false,
  stockOpname: false, absensi: false, daftarIzin: false, isSuperAdmin: false,
};

export function getCapabilities(user: UserSession | null): Capabilities {
  if (!user) return { ...NONE };
  const role = user.role as Role;
  const scope = (user.access_scope ?? null) as AccessScope;

  if (role === "super_admin" || user.role === "owner" || user.role === "manager") {
    return {
      dashboard: true, bahanBaku: true, produksiFlow: true,
      adonan: true, rendam: true, packingFreezer: true, produksiRiwayat: true,
      pengiriman: true, produkReject: true, kelolaUser: true, masterResep: true,
      stockOpname: true, absensi: true, daftarIzin: false, isSuperAdmin: true,
    };
  }

  if (role === "pic") {
    // PIC: Dashboard (sebagian card) + Bahan Baku (read-only) + Stock Opname
    return { ...NONE, dashboard: true, bahanBaku: true, stockOpname: true };
  }

  if (role === "staff_produksi") {
    return { ...NONE, bahanBaku: true };
  }

  if (role === "staff_packing_pengiriman") {
    return { ...NONE, pengiriman: true, produkReject: true };
  }

  if (role === "spv") {
    // SPV: + Dashboard (card Stok Cane saja) + Stok Produk Reject (read-only)
    if (scope === "packing") {
      return { ...NONE, dashboard: true, produkReject: true, produksiFlow: true, packingFreezer: true, produksiRiwayat: true, daftarIzin: true };
    }
    return { ...NONE, dashboard: true, produkReject: true, produksiFlow: true, adonan: true, rendam: true, produksiRiwayat: true, daftarIzin: true };
  }

  return { ...NONE };
}

export function homeRoute(user: UserSession | null): string {
  const caps = getCapabilities(user);
  if (caps.dashboard) return "/dashboard";
  if (caps.bahanBaku || caps.produksiFlow) return "/packing";
  if (caps.pengiriman) return "/pengiriman";
  if (caps.produkReject) return "/produk-reject";
  if (caps.stockOpname) return "/stock-opname";
  return "/login";
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "spv",                       label: "SPV" },
  { value: "staff_produksi",            label: "Staff Produksi" },
  { value: "staff_packing_pengiriman",  label: "Staff Packing Pengiriman" },
  { value: "pic",                       label: "PIC" },
  { value: "super_admin",               label: "Super Admin" },
];

export const SCOPE_OPTIONS: { value: Exclude<AccessScope, null>; label: string }[] = [
  { value: "adonan_rendam", label: "Adonan & Rendam" },
  { value: "packing",       label: "Packing & Freezer" },
];
