"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getUserSession, clearUserSession, getRoleLabel, getScopeLabel, type UserSession } from "@/lib/auth";
import { getCapabilities } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Workflow,
  Truck,
  Users,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  CalendarClock,
  FileText,
  FileSignature,
  ShieldAlert,
  SlidersHorizontal,
  LogOut,
  X,
} from "lucide-react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  useEffect(() => { setUser(getUserSession()); }, []);
  const caps = getCapabilities(user);

  // Nav items difilter berdasarkan capability
  const navItems = [
    { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, show: caps.dashboard },
    { href: "/packing",       label: "Produksi",      icon: Workflow,        show: caps.bahanBaku || caps.produksiFlow },
    { href: "/pengiriman",    label: "Pengiriman",    icon: Truck,           show: caps.pengiriman },
    { href: "/produk-reject", label: "Produk Reject", icon: AlertTriangle,   show: caps.produkReject },
    { href: "/stock-opname",  label: "Stock Opname",  icon: ClipboardList,   show: caps.stockOpname },
    { href: "/daftar-izin",   label: "Daftar Izin",   icon: CalendarClock,   show: caps.daftarIzin },
    { href: "/lapor-pelanggaran", label: "Lapor Pelanggaran", icon: ShieldAlert, show: caps.laporPelanggaran },
  ].filter((i) => i.show);

  const adminItems = [
    { href: "/absensi",     label: "Absensi",             icon: CalendarClock, show: caps.absensi },
    { href: "/kelola-dokumen", label: "Dokumen",          icon: FileText, show: caps.dokumen },
    { href: "/ttd-karyawan",  label: "TTD Dokumen Karyawan", icon: FileSignature, show: caps.dokumen },
    { href: "/pelanggaran",   label: "Pelanggaran & Poin", icon: ShieldAlert, show: caps.pelanggaran },
    { href: "/aturan",        label: "Aturan & Nominal",   icon: SlidersHorizontal, show: caps.aturan },
    { href: "/admin/users", label: "Kelola User",         icon: Users,    show: caps.kelolaUser },
    { href: "/admin/resep", label: "Master Resep Adonan", icon: BookOpen, show: caps.masterResep },
  ].filter((i) => i.show);

  const handleLogout = () => {
    clearUserSession();
    router.push("/login");
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 z-30 flex flex-col transition-transform duration-300",
          "lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <img src="/logo-cane.png" alt="Cane RawtheR" className="w-9 h-9 object-contain rounded-full" />
            <p className="font-bold text-gray-800 text-sm leading-tight">Cane RawtheR</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 bg-amber-50 border-b border-amber-100">
          <p className="font-semibold text-gray-800 text-sm">{user?.nama}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {getRoleLabel(user?.role ?? "")}
            </span>
            {getScopeLabel(user?.access_scope) && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {getScopeLabel(user?.access_scope)}
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {adminItems.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 font-medium px-3 mb-1 uppercase tracking-wider">Admin</p>
              <div className="space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        active ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>
    </>
  );
}
