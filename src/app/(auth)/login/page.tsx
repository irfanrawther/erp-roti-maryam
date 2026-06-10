"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginWithPin, saveUserSession, getUserSession, hashPin } from "@/lib/auth";

export default function LoginPage() {
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugHash, setDebugHash] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (getUserSession()) router.replace("/dashboard");
    inputs.current[0]?.focus();
  }, [router]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError("");
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
    if (newPin.every((d) => d !== "") && index === 5) {
      handleSubmit(newPin.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (pinStr?: string) => {
    const finalPin = pinStr ?? pin.join("");
    if (finalPin.length !== 6) {
      setError("Masukkan 6 digit PIN");
      return;
    }
    setLoading(true);

    // Tampilkan hash yang digenerate untuk debugging
    const generatedHash = await hashPin(finalPin);
    setDebugHash(generatedHash);

    const { user, error: authError } = await loginWithPin(finalPin);
    setLoading(false);
    if (authError || !user) {
      // Tampilkan pesan error yang lebih spesifik dari server
      setError(authError ?? "PIN salah atau akun tidak aktif");
      setPin(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 100);
      return;
    }
    saveUserSession({ id: user.id, nama: user.nama, role: user.role });
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🥐</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Roti Maryam ERP</h1>
          <p className="text-sm text-gray-500 mt-1">Masukkan PIN 6 digit Anda</p>
        </div>

        {/* PIN Input */}
        <div className="flex gap-3 justify-center mb-6">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digit}
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

        <button
          onClick={() => handleSubmit()}
          disabled={loading || pin.some((d) => d === "")}
          className="btn-primary w-full py-3 text-base"
        >
          {loading ? "Memverifikasi..." : "Masuk"}
        </button>

        <p className="text-center text-xs text-gray-400 mt-6">
          Hubungi Manager jika lupa PIN
        </p>

        {/* DEBUG PANEL — hapus setelah masalah selesai */}
        {debugHash && (
          <div className="mt-4 p-3 bg-gray-100 rounded-lg text-left">
            <p className="text-xs font-bold text-gray-500 mb-1">🔧 DEBUG INFO</p>
            <p className="text-xs text-gray-500 mb-1">Hash yang digenerate browser:</p>
            <p className="text-[10px] font-mono break-all bg-white p-2 rounded border text-gray-700 select-all">
              {debugHash}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Salin hash ini → bandingkan dengan kolom <code>pin_hash</code> di tabel <code>users</code> Supabase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
