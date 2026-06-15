"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserSession, clearUserSession } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import { Menu, LogOut } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!getUserSession()) {
      router.replace("/login");
    }
  }, [router]);

  const handleLogout = () => {
    clearUserSession();
    router.push("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-amber-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with hamburger menu for mobile */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/logo-cane.png" alt="Cane RawtheR" className="w-7 h-7 object-contain rounded-full" />
              <span className="font-bold text-gray-800">Cane RawtheR</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={14} /> Keluar
          </button>
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
