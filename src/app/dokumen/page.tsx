"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/auth";
import { FileSignature, CheckCircle2, AlertCircle, X, ChevronRight } from "lucide-react";
import type { Dok } from "./DokumenViewer";

const DokumenViewer = dynamic(() => import("./DokumenViewer"), { ssr: false });

interface Karyawan { id: string; nama: string }
interface DokRow extends Dok {
  approved: boolean; // sudah setuju versi terbaru
}

export default function DokumenPage() {
  const [step, setStep] = useState<"pin" | "list" | "view">("pin");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);
  const [docs, setDocs] = useState<DokRow[]>([]);
  const [active, setActive] = useState<DokRow | null>(null);

  async function loadDocs(karyawanId: string) {
    const [dRes, pRes] = await Promise.all([
      supabase.from("dokumen").select("id, nama, file_pdf_url, versi, wajib_ttd").eq("is_aktif", true).order("created_at"),
      supabase.from("dokumen_persetujuan").select("dokumen_id, dokumen_versi").eq("karyawan_id", karyawanId),
    ]);
    const persetujuan = (pRes.data as { dokumen_id: string; dokumen_versi: number }[] | null) ?? [];
    const rows: DokRow[] = ((dRes.data as Dok[] | null) ?? []).map((d) => ({
      ...d,
      approved: persetujuan.some((p) => p.dokumen_id === d.id && p.dokumen_versi === d.versi),
    }));
    setDocs(rows);
  }

  async function submitPin() {
    setPinErr("");
    if (!/^\d{6}$/.test(pin)) { setPinErr("PIN harus 6 digit"); return; }
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data: k } = await supabase.from("karyawan")
        .select("id, nama").eq("pin_absensi", hash).eq("status", "aktif").maybeSingle();
      if (!k) { setPinErr("PIN tidak ditemukan"); return; }
      setKaryawan(k as Karyawan);
      await loadDocs((k as Karyawan).id);
      setStep("list");
    } catch { setPinErr("Terjadi kesalahan, coba lagi"); }
    finally { setBusy(false); }
  }

  function reset() { setStep("pin"); setPin(""); setPinErr(""); setKaryawan(null); setDocs([]); setActive(null); }

  return (
    <div className="min-h-screen bg-indigo-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-14 h-14 object-contain rounded-full mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Dokumen Perusahaan</h1>
          <p className="text-sm text-gray-500">Cane RawtheR</p>
        </div>

        {step === "pin" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Masukkan PIN Absensi</label>
            <input inputMode="numeric" maxLength={6} autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-400 outline-none"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()} placeholder="••••••" />
            {pinErr && <p className="text-sm text-red-500 text-center">{pinErr}</p>}
            <button onClick={submitPin} disabled={busy || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors">
              {busy ? "Memeriksa..." : "Lanjut"}
            </button>
          </div>
        )}

        {step === "list" && karyawan && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <div className="text-center mb-1">
              <p className="text-lg font-bold text-gray-800">{karyawan.nama}</p>
              <p className="text-xs text-gray-500">Daftar dokumen yang perlu dibaca / ditandatangani</p>
            </div>
            {docs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Belum ada dokumen aktif</p>
            ) : docs.map((d) => (
              <button key={d.id} onClick={() => { setActive(d); setStep("view"); }}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{d.nama}</p>
                  <p className="text-[11px] text-gray-400">Versi {d.versi} · {d.wajib_ttd ? "Wajib TTD" : "Baca Saja"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.approved
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 size={14} /> Sudah</span>
                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><AlertCircle size={14} /> Belum</span>}
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            ))}
            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600 pt-1">Ganti karyawan</button>
          </div>
        )}

        {step === "view" && karyawan && active && (
          <DokumenViewer dok={active} karyawanId={karyawan.id}
            onBack={() => setStep("list")}
            onDone={async () => { await loadDocs(karyawan.id); setStep("list"); }} />
        )}

        <button onClick={() => (window.location.href = "/login")} className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
          <X size={14} /> Kembali
        </button>
      </div>
    </div>
  );
}
