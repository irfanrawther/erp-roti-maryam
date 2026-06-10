"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getUserSession, clearUserSession, canAccessAdmin, getRoleLabel } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ChefHat,
  Snowflake,
  Truck,
  Users,
  BookOpen,
  LogOut,
  X,
  CookingPot,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bahan-baku", label: "Bahan Baku", icon: Package },
  { href: "/produksi", label: "Produksi", icon: ChefHat },
  { href: "/proses-bikin", label: "Proses Bikin", icon: CookingPot },
  { href: "/packing", label: "Packing & Freezer", icon: Snowflake },
  { href: "/pengiriman", label: "Pengiriman", icon: Truck },
];

const adminItems = [
  { href: "/admin/users", label: "Kelola User", icon: Users },
  { href: "/admin/resep", label: "Master Resep Adonan", icon: BookOpen },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUserSession();

  const handleLogout = () => {
    clearUserSession();
    router.push("/login");
  };

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
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
          <div className="flex items-center gap-2">
            <span className="text-2xl">🥐</span>
            <div>
              <p className="font-bold text-gray-800 text-sm">Roti Maryam</p>
              <p className="text-xs text-gray-400">ERP System</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 bg-amber-50 border-b border-amber-100">
          <p className="font-semibold text-gray-800 text-sm">{user?.nama}</p>
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {getRoleLabel(user?.role ?? "")}
          </span>
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
                    active
                      ? "bg-amber-500 text-white"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {user && canAccessAdmin(user.role) && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 font-medium px-3 mb-1 uppercase tracking-wider">
                Admin
              </p>
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
                        active
                          ? "bg-amber-500 text-white"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
