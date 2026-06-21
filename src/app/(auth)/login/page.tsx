"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin, saveUserSession, getUserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { ChevronLeft, UserCog, Factory, Truck, ShieldCheck, ClipboardList } from "lucide-react";

type RoleChoice = {
  role: "spv" | "staff_produksi" | "pic" | "staff_packing_pengiriman" | "super_admin";
  label: string;
  icon: typeof UserCog;
  color: string;
};

const ROLE_CHOICES: RoleChoice[] = [
  { role: "spv",                      label: "SPV",                      icon: UserCog,       color: "amber"  },
  { role: "staff_produksi",           label: "Staff Produksi",           icon: Factory,       color: "blue"   },
  { role: "pic",                      label: "PIC",                      icon: ClipboardList, color: "teal"   },
  { role: "staff_packing_pengiriman", label: "Staff Packing Pengiriman", icon: Truck,         color: "green"  },
  { role: "super_admin",              label: "Super Admin",              icon: ShieldCheck,   color: "purple" },
];

const COLOR_MAP: Record<string, string> = {
  amber:  "border-amber-200  hover:border-amber-400  hover:bg-amber-50  text-amber-600",
  blue:   "border-blue-200   hover:border-blue-400   hover:bg-blue-50   text-blue-600",
  teal:   "border-teal-200   hover:border-teal-400   hover:bg-teal-50   text-teal-600",
  green:  "border-green-200  hover:border-green-400  hover:bg-green-50  text-green-600",
  purple: "border-purple-200 hover:border-purple-400 hover:bg-purple-50 text-purple-600",
};

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<RoleChoice | null>(null);
  const [pin,   setPin]   = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  useEffect(() => {
    const u = getUserSession();
    if (u) router.replace(homeRoute(u));
  }, [router]);

  useEffect(() => {
    if (selectedRole) setTimeout(() => inputs.current[0]?.focus(), 50);
  }, [selectedRole]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError("");
    if (value && index < 5) inputs.current[index + 1]?.focus();
    if (newPin.every((d) => d !== "") && index === 5) handleSubmit(newPin.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) inputs.current[index - 1]?.focus();
  };

  const handleSubmit = async (pinStr?: string) => {
    if (!selectedRole) return;
    const finalPin = pinStr ?? pin.join("");
    if (finalPin.length !== 6) { setError("Masukkan 6 digit PIN"); return; }
    setLoading(true);
    const { user, error: authError } = await loginWithPin(finalPin, selectedRole.role);
    setLoading(false);
    if (authError || !user) {
      setError(authError ?? "PIN salah");
      setPin(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 100);
      return;
    }
    saveUserSession({ id: user.id, nama: user.nama, role: user.role, access_scope: user.access_scope });
    router.push(homeRoute(user));
  };

  function backToRoles() {
    setSelectedRole(null);
    setPin(["", "", "", "", "", ""]);
    setError("");
  }

  // Split: 3 di baris pertama, 2 di baris kedua
  const row1 = ROLE_CHOICES.slice(0, 3);
  const row2 = ROLE_CHOICES.slice(3);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-20 h-20 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800">Cane RawtheR</h1>
          <p className="text-sm text-gray-500 mt-1">
            {selectedRole ? `Masuk sebagai ${selectedRole.label}` : "Pilih role Anda"}
          </p>
        </div>

        {/* Step 1: Pilih role */}
        {!selectedRole && (
          <div className="space-y-3">
            {/* Baris 1: SPV, Staff Produksi, PIC */}
            <div className="grid grid-cols-3 gap-3">
              {row1.map((rc) => {
                const Icon = rc.icon;
                return (
                  <button key={rc.role} onClick={() => setSelectedRole(rc)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${COLOR_MAP[rc.color]}`}>
                    <Icon size={24} />
                    <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{rc.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Baris 2: Staff Packing Pengiriman, Super Admin */}
            <div className="grid grid-cols-2 gap-3">
              {row2.map((rc) => {
                const Icon = rc.icon;
                return (
                  <button key={rc.role} onClick={() => setSelectedRole(rc)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${COLOR_MAP[rc.color]}`}>
                    <Icon size={24} />
                    <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{rc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Input PIN */}
        {selectedRole && (
          <div>
            <button onClick={backToRoles} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-5">
              <ChevronLeft size={16} /> Ganti role
            </button>

            <div className="flex gap-2.5 justify-center mb-6">
              {pin.map((digit, i) => (
                <input key={i} ref={(el) => { inputs.current[i] = el; }}
                  type="tel" inputMode="numeric" maxLength={1} value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-amber-400 focus:outline-none transition-colors"
                  style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
                />
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-center">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            <button onClick={() => handleSubmit()} disabled={loading || pin.some((d) => d === "")}
              className="btn-primary w-full py-3 text-base">
              {loading ? "Memverifikasi..." : "Masuk"}
            </button>

            <p className="text-center text-xs text-gray-400 mt-6">Hubungi Super Admin jika lupa PIN</p>
          </div>
        )}
      </div>
    </div>
  );
}
