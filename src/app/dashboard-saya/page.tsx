"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/auth";
import { UserCircle, Clock, ClipboardList, CalendarDays, FileText, CheckCircle2, AlertCircle, X, ExternalLink, ShieldAlert } from "lucide-react";
import { kuartalSekarang, labelKuartal, POIN_PER_SP } from "@/lib/poin";

interface Karyawan { id: string; nama: string; jabatan: string | null }
interface ShiftInfo { nama_shift: string; jam_masuk: string; jam_pulang: string }
interface AssignRow { tanggal: string; is_libur: boolean; shift_id: string | null; shift_master: ShiftInfo | null }
interface AbsRow {
  tanggal: string; jam_checkin: string | null; jam_checkout: string | null;
  menit_telat: number; status_kehadiran: string; is_flagged: boolean; is_override: boolean;
  shift_master: { nama_shift: string } | null;
}
interface Jobdesk { shift_id: string; jobdesk_awal: string | null; jobdesk_akhir: string | null }
interface DokItem { id: string; nama: string; versi: number; wajib_ttd: boolean; file_pdf_url: string | null; approved: { disetujui_at: string; tipe: string; tanda_tangan_url: string | null } | null }

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function addDaysStr(iso: string, n: number) { const d = new Date(`${iso}T00:00:00+07:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function hariTgl(iso: string) { return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function hariTglPendek(iso: string) { return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short" }); }
function jam(iso: string | null) { return iso ? new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }) : "—"; }
function tglWaktu(iso: string) { return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

// Status kehadiran FAKTA (tanpa denda/kategori)
function statusKehadiran(a: AbsRow): { text: string; cls: string } {
  if (a.is_flagged && !a.is_override) return { text: "Menunggu konfirmasi", cls: "text-amber-600" };
  if (a.status_kehadiran === "alpha") return { text: "Alpha", cls: "text-red-600" };
  if (a.status_kehadiran === "izin") return { text: "Izin", cls: "text-blue-600" };
  if (a.status_kehadiran === "izin_sakit") return { text: "Izin Sakit", cls: "text-teal-600" };
  if (a.menit_telat > 0) return { text: `Telat ${a.menit_telat} menit`, cls: "text-orange-600" };
  return { text: "Tepat waktu", cls: "text-green-600" };
}

export default function DashboardSayaPage() {
  const [step, setStep] = useState<"pin" | "dash">("pin");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);

  const [assigns, setAssigns] = useState<AssignRow[]>([]);
  const [absensi, setAbsensi] = useState<AbsRow[]>([]);
  const [jobdesks, setJobdesks] = useState<Jobdesk[]>([]);
  const [docs, setDocs] = useState<DokItem[]>([]);
  const [poinRows, setPoinRows] = useState<{ tanggal: string; poin: number; sumber: string; master_pelanggaran: { nama_pelanggaran: string } | null; catatan: string | null }[]>([]);
  const [spLevel, setSpLevel] = useState(0);
  const [spBefore, setSpBefore] = useState(0);

  const today = todayWIB();
  const monthStart = today.slice(0, 8) + "01";

  async function submitPin() {
    setPinErr("");
    if (!/^\d{6}$/.test(pin)) { setPinErr("PIN harus 6 digit"); return; }
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data: k } = await supabase.from("karyawan")
        .select("id, nama, jabatan").eq("pin_absensi", hash).eq("status", "aktif").maybeSingle();
      if (!k) { setPinErr("PIN tidak ditemukan"); return; }
      const kar = k as Karyawan; setKaryawan(kar);

      const upTo = addDaysStr(today, 7);
      const [asg, abs, jd, dk, pj, pn, spr] = await Promise.all([
        supabase.from("shift_assignment").select("tanggal, is_libur, shift_id, shift_master:shift_id(nama_shift, jam_masuk, jam_pulang)")
          .eq("karyawan_id", kar.id).gte("tanggal", monthStart).lte("tanggal", upTo).order("tanggal"),
        supabase.from("absensi").select("tanggal, jam_checkin, jam_checkout, menit_telat, status_kehadiran, is_flagged, is_override, shift_master:shift_id(nama_shift)")
          .eq("karyawan_id", kar.id).gte("tanggal", monthStart).lte("tanggal", today).order("tanggal", { ascending: false }),
        supabase.from("jobdesk_shift").select("shift_id, jobdesk_awal, jobdesk_akhir"),
        supabase.from("dokumen").select("id, nama, versi, wajib_ttd, file_pdf_url").eq("is_aktif", true).order("created_at"),
        supabase.from("dokumen_persetujuan").select("dokumen_id, dokumen_versi, disetujui_at, tipe, tanda_tangan_url").eq("karyawan_id", kar.id),
        supabase.from("poin_karyawan").select("tanggal, poin, sumber, catatan, master_pelanggaran:pelanggaran_id(nama_pelanggaran)").eq("karyawan_id", kar.id).eq("kuartal", kuartalSekarang()).order("tanggal", { ascending: false }),
        supabase.from("status_sp_karyawan").select("level_sp, kuartal_kena").eq("karyawan_id", kar.id).eq("is_aktif", true),
      ]);
      setAssigns((asg.data as unknown as AssignRow[]) ?? []);
      setAbsensi((abs.data as unknown as AbsRow[]) ?? []);
      setJobdesks((jd.data as Jobdesk[]) ?? []);
      const persetujuan = (pj.data as { dokumen_id: string; dokumen_versi: number; disetujui_at: string; tipe: string; tanda_tangan_url: string | null }[] | null) ?? [];
      setDocs(((dk.data as { id: string; nama: string; versi: number; wajib_ttd: boolean; file_pdf_url: string | null }[] | null) ?? []).map((d) => ({
        ...d, approved: persetujuan.find((p) => p.dokumen_id === d.id && p.dokumen_versi === d.versi) ?? null,
      })));
      setPoinRows((pn.data as unknown as { tanggal: string; poin: number; sumber: string; master_pelanggaran: { nama_pelanggaran: string } | null; catatan: string | null }[]) ?? []);
      const sps = (spr.data as { level_sp: number; kuartal_kena: string }[] | null) ?? [];
      setSpLevel(sps.reduce((mx, s) => Math.max(mx, s.level_sp), 0));
      setSpBefore(sps.filter((s) => s.kuartal_kena !== kuartalSekarang()).reduce((mx, s) => Math.max(mx, s.level_sp), 0));
      setStep("dash");
    } catch { setPinErr("Terjadi kesalahan, coba lagi"); }
    finally { setBusy(false); }
  }

  function reset() { setStep("pin"); setPin(""); setPinErr(""); setKaryawan(null); }

  const shiftHariIni = assigns.find((a) => a.tanggal === today);
  const jadwalDepan = assigns.filter((a) => a.tanggal > today);
  const riwayatJadwal = assigns.filter((a) => a.tanggal < today);
  const jobdeskHariIni = shiftHariIni && !shiftHariIni.is_libur ? jobdesks.find((j) => j.shift_id === shiftHariIni.shift_id) : null;

  const shiftLabel = (a: AssignRow) => a.is_libur ? "Libur" : a.shift_master ? `${a.shift_master.nama_shift} (${a.shift_master.jam_masuk.slice(0, 5)}-${a.shift_master.jam_pulang.slice(0, 5)})` : "—";

  return (
    <div className="min-h-screen bg-violet-50 p-4">
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-5 pt-2">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-14 h-14 object-contain rounded-full mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Dashboard Saya</h1>
          <p className="text-sm text-gray-500">Cane RawtheR</p>
        </div>

        {step === "pin" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 max-w-sm mx-auto">
            <label className="block text-sm font-medium text-gray-700">Masukkan PIN Absensi</label>
            <input inputMode="numeric" maxLength={6} autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border-2 border-gray-200 focus:border-violet-400 outline-none"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()} placeholder="••••••" />
            {pinErr && <p className="text-sm text-red-500 text-center">{pinErr}</p>}
            <button onClick={submitPin} disabled={busy || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-600 disabled:opacity-40 transition-colors">
              {busy ? "Memeriksa..." : "Lihat Dashboard"}
            </button>
          </div>
        )}

        {step === "dash" && karyawan && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center"><UserCircle size={28} className="text-violet-500" /></div>
              <div><p className="font-bold text-gray-800">{karyawan.nama}</p><p className="text-xs text-gray-500">{karyawan.jabatan ?? "Karyawan"}</p></div>
            </div>

            {/* SECTION POIN */}
            {(() => {
              const totalPoin = poinRows.reduce((s, p) => s + Number(p.poin), 0);
              const curSP = Math.min(3, spBefore + Math.floor(totalPoin / POIN_PER_SP));
              const dalamLevel = totalPoin % POIN_PER_SP;
              const nextSP = curSP + 1;
              return (
                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2"><ShieldAlert size={16} className="text-red-500" /> Poin Pelanggaran</h2>
                    <span className="text-xs text-gray-400">{labelKuartal(kuartalSekarang())}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-3xl font-bold text-gray-800">{totalPoin} <span className="text-sm font-normal text-gray-400">poin</span></p>
                    {spLevel > 0 && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${spLevel >= 3 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>Status: SP{spLevel}</span>}
                  </div>
                  {curSP < 3 ? (
                    <div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${(dalamLevel / POIN_PER_SP) * 100}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{dalamLevel} dari {POIN_PER_SP} poin menuju SP{nextSP}</p>
                    </div>
                  ) : <p className="text-xs text-red-600 font-semibold">SP3 tercapai — perlu tindak lanjut manajemen.</p>}
                  {poinRows.length > 0 && (
                    <div className="pt-1 border-t border-gray-50 space-y-1">
                      {poinRows.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs py-0.5">
                          <span className="text-gray-600 truncate">{hariTglPendek(p.tanggal)} · {p.master_pelanggaran?.nama_pelanggaran ?? p.catatan ?? "Pelanggaran"}</span>
                          <span className="font-semibold text-red-500 shrink-0">+{p.poin}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SECTION 1 — Jadwal */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2"><CalendarDays size={16} className="text-violet-500" /> Jadwal Saya</h2>
              <div className="rounded-xl bg-violet-50 p-3">
                <p className="text-xs text-gray-500">Hari ini · {hariTgl(today)}</p>
                <p className="font-bold text-violet-700">{shiftHariIni ? shiftLabel(shiftHariIni) : "Belum ada jadwal"}</p>
              </div>
              {jadwalDepan.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Ke Depan</p>
                  <div className="space-y-1">
                    {jadwalDepan.map((a) => (
                      <div key={a.tanggal} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                        <span className="text-gray-600">{hariTglPendek(a.tanggal)}</span>
                        <span className={`font-medium ${a.is_libur ? "text-gray-400" : "text-gray-800"}`}>{shiftLabel(a)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {riwayatJadwal.length > 0 && (
                <details>
                  <summary className="text-xs font-semibold text-gray-400 uppercase cursor-pointer">Riwayat Jadwal Bulan Ini ({riwayatJadwal.length})</summary>
                  <div className="space-y-1 mt-1">
                    {[...riwayatJadwal].reverse().map((a) => (
                      <div key={a.tanggal} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                        <span className="text-gray-600">{hariTglPendek(a.tanggal)}</span>
                        <span className={`font-medium ${a.is_libur ? "text-gray-400" : "text-gray-700"}`}>{shiftLabel(a)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* SECTION 2 — Jobdesk */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2"><ClipboardList size={16} className="text-violet-500" /> Jobdesk Hari Ini</h2>
              {!shiftHariIni || shiftHariIni.is_libur ? (
                <p className="text-sm text-gray-400">Tidak ada shift hari ini.</p>
              ) : !jobdeskHariIni || (!jobdeskHariIni.jobdesk_awal && !jobdeskHariIni.jobdesk_akhir) ? (
                <p className="text-sm text-gray-400">Jobdesk belum diatur untuk shift ini.</p>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-xl bg-green-50 p-3">
                    <p className="text-xs font-semibold text-green-600 mb-0.5">Tugas Awal Shift</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{jobdeskHariIni.jobdesk_awal || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-600 mb-0.5">Tugas Akhir Shift</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{jobdeskHariIni.jobdesk_akhir || "—"}</p>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3 — Riwayat Kehadiran */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Clock size={16} className="text-violet-500" /> Riwayat Kehadiran Bulan Ini</h2>
              {absensi.length === 0 ? <p className="text-sm text-gray-400">Belum ada data kehadiran bulan ini.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-400 uppercase border-b border-gray-100">
                      <th className="py-1.5 pr-2">Tanggal</th><th className="py-1.5 pr-2">Shift</th><th className="py-1.5 pr-2">Masuk</th><th className="py-1.5 pr-2">Keluar</th><th className="py-1.5">Status</th>
                    </tr></thead>
                    <tbody>
                      {absensi.map((a) => {
                        const s = statusKehadiran(a);
                        return (
                          <tr key={a.tanggal} className="border-b border-gray-50 last:border-0">
                            <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">{hariTglPendek(a.tanggal)}</td>
                            <td className="py-1.5 pr-2 text-gray-500">{a.shift_master?.nama_shift ?? "—"}</td>
                            <td className="py-1.5 pr-2 tabular-nums text-gray-600">{jam(a.jam_checkin)}</td>
                            <td className="py-1.5 pr-2 tabular-nums text-gray-600">{jam(a.jam_checkout)}</td>
                            <td className={`py-1.5 font-semibold ${s.cls}`}>{s.text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* SECTION 4 — Dokumen */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <h2 className="font-bold text-gray-700 text-sm flex items-center gap-2"><FileText size={16} className="text-violet-500" /> Dokumen Saya</h2>
              {docs.length === 0 ? <p className="text-sm text-gray-400">Belum ada dokumen.</p> : docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.nama}</p>
                    {d.approved
                      ? <p className="text-[11px] text-green-600">{d.approved.tipe === "ttd" ? "Sudah TTD" : "Sudah Baca"} · {tglWaktu(d.approved.disetujui_at)}</p>
                      : <p className="text-[11px] text-red-500">Belum</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.approved
                      ? <CheckCircle2 size={16} className="text-green-500" />
                      : <a href="/dokumen" className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5">Tanda tangani <ExternalLink size={11} /></a>}
                    {d.file_pdf_url && <a href={d.file_pdf_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-gray-500"><ExternalLink size={14} /></a>}
                    {d.approved?.tanda_tangan_url && <a href={d.approved.tanda_tangan_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:underline">TTD</a>}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">Ganti karyawan / Keluar</button>
          </div>
        )}

        <button onClick={() => (window.location.href = "/login")} className="w-full mt-4 mb-6 text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
          <X size={14} /> Kembali
        </button>
      </div>
    </div>
  );
}
