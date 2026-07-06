"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { CalendarClock } from "lucide-react";

interface IzinRow {
  id: string; tanggal_izin: string;
  karyawan: { nama: string } | null;
}

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function addDaysStr(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00+07:00`); d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
// "Rabu, 2 Juli 2026"
function labelHariTgl(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

type Mode = "besok" | "7hari" | "custom";

export default function DaftarIzinPage() {
  const router = useRouter();
  const [rows, setRows] = useState<IzinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("besok");
  const [customTgl, setCustomTgl] = useState(todayWIB());

  useEffect(() => {
    const u = getUserSession();
    if (!u || !getCapabilities(u).daftarIzin) { router.replace(homeRoute(u)); return; }
  }, [router]);

  const today = todayWIB();
  const range = (() => {
    if (mode === "besok")  return { start: today, end: addDaysStr(today, 1) };
    if (mode === "7hari")  return { start: today, end: addDaysStr(today, 7) };
    return { start: customTgl, end: customTgl };
  })();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pengajuan_izin")
      .select("id, tanggal_izin, karyawan:karyawan_id(nama)")
      .eq("status", "aktif")
      .gte("tanggal_izin", range.start).lte("tanggal_izin", range.end)
      .order("tanggal_izin", { ascending: true });
    setRows((data as unknown as IzinRow[]) ?? []);
    setLoading(false);
  }, [range.start, range.end]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <CalendarClock size={20} className="text-sky-500" />
        <h1 className="text-xl font-bold text-gray-800">Daftar Izin</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Karyawan yang mengajukan izin tidak masuk.</p>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {([["besok", "Hari Ini & Besok"], ["7hari", "7 Hari ke Depan"], ["custom", "Pilih Tanggal"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === k ? "bg-sky-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
        {mode === "custom" && (
          <input type="date" className="input py-1.5 text-sm w-auto" value={customTgl} onChange={(e) => setCustomTgl(e.target.value)} />
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
              <th className="px-4 py-2.5 font-semibold">Nama Karyawan</th>
              <th className="px-4 py-2.5 font-semibold">Hari & Tanggal Izin</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Tidak ada karyawan izin pada rentang ini</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.karyawan?.nama ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{labelHariTgl(r.tanggal_izin)}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Izin</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
