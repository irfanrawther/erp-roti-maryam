"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

interface ShiftAssignRow { karyawan_id: string; shift_id: string | null; karyawan: { nama: string } | null; shift_master: { nama_shift: string } | null }
interface RosterRow { id: string; tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null }

interface BarisHari {
  karyawan_id: string; nama: string; shift_id: string | null; shift_nama: string | null;
  roster_id: string | null; tugas_datang: string; tugas_pulang: string;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const TUGAS_AWAL: string[] = [
  "Cuci Meja Ngadon", "Lap Tampah", "Cuci Meja Bikin", "Parut Keju", "Timbang Bahan",
  "Sapu + Pel Area Bikin + Sampah", "Lap Kaca", "Cuci Kompor + Cuci Meja", "Lap Alat Tekan + Lap Rak",
  "Cuci Meja Packing", "Cuci Mesin", "Prepare Bahan Ngadon", "Sapu Area Ngadon + Cuci Meja Ngadon",
  "Cuci Meja Bikin + Rak & Ember Minyak", "Cuci Lap + Cuci Ember Bekas Limbah", "Cuci Peralatan + Cuci Sink",
  "Cuci Tampah", "Isi Box Mentega", "Lap Alat Tekan + Lap Kaca", "Cuci Meja + Nyapu + Lap Freezer",
  "Lap Vacuum + Ngepel + Sampah",
];
const OPSI_BARU = "__baru__";

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function addDaysStr(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00+07:00`); d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
function seninMinggu(iso: string): string {
  const d = new Date(`${iso}T00:00:00+07:00`);
  const dow = d.getDay();
  const mundur = dow === 0 ? 6 : dow - 1;
  return addDaysStr(iso, -mundur);
}
function labelTglPendek(iso: string) {
  const d = new Date(`${iso}T00:00:00+07:00`);
  return d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
}

export default function AuditKebersihanRosterPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [seninAwal, setSeninAwal] = useState(() => addDaysStr(seninMinggu(todayWIB()), 7));
  const hariList = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysStr(seninAwal, i)), [seninAwal]);
  const [expanded, setExpanded] = useState<string | null>(hariList[0]);

  const [dataHari, setDataHari] = useState<Record<string, BarisHari[]>>({});
  const [daftarTugas, setDaftarTugas] = useState<string[]>(TUGAS_AWAL);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muatMinggu = useCallback(async () => {
    setLoading(true);
    const [saRes, rhRes, histRes] = await Promise.all([
      supabase.from("shift_assignment")
        .select("tanggal, karyawan_id, shift_id, karyawan:karyawan_id(nama), shift_master:shift_id(nama_shift)")
        .gte("tanggal", hariList[0]).lte("tanggal", hariList[6]).eq("is_libur", false).not("shift_id", "is", null),
      supabase.from("audit_kebersihan_roster_harian")
        .select("id, tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang")
        .gte("tanggal", hariList[0]).lte("tanggal", hariList[6]).eq("is_aktif", true),
      supabase.from("audit_kebersihan_roster_harian").select("nama_tugas, nama_tugas_datang").limit(2000),
    ]);
    const saRows = (saRes.data as unknown as (ShiftAssignRow & { tanggal: string })[] | null) ?? [];
    const rhRows = (rhRes.data as RosterRow[] | null) ?? [];
    const histRows = (histRes.data as { nama_tugas: string; nama_tugas_datang: string | null }[] | null) ?? [];

    const histSet = new Set<string>(TUGAS_AWAL);
    histRows.forEach((r) => { if (r.nama_tugas) histSet.add(r.nama_tugas); if (r.nama_tugas_datang) histSet.add(r.nama_tugas_datang); });
    setDaftarTugas(Array.from(histSet).sort((a, b) => a.localeCompare(b)));

    const byHari: Record<string, BarisHari[]> = {};
    hariList.forEach((tgl) => {
      const shiftHariItu = saRows.filter((r) => r.tanggal === tgl).sort((a, b) => (a.karyawan?.nama ?? "").localeCompare(b.karyawan?.nama ?? ""));
      byHari[tgl] = shiftHariItu.map((r) => {
        const roster = rhRows.find((x) => x.tanggal === tgl && x.karyawan_id === r.karyawan_id);
        return {
          karyawan_id: r.karyawan_id, nama: r.karyawan?.nama ?? "-", shift_id: r.shift_id, shift_nama: r.shift_master?.nama_shift ?? null,
          roster_id: roster?.id ?? null, tugas_datang: roster?.nama_tugas_datang ?? "", tugas_pulang: roster?.nama_tugas ?? "",
        };
      });
    });
    setDataHari(byHari);
    setLoading(false);
  }, [hariList]);

  useEffect(() => { muatMinggu(); }, [muatMinggu]);

  async function simpanSel(tgl: string, baris: BarisHari, field: "tugas_datang" | "tugas_pulang", nilai: string) {
    const key = `${tgl}|${baris.karyawan_id}`;
    setSavingKey(key); setErr("");
    const updated: BarisHari = { ...baris, [field]: nilai };
    setDataHari((d) => ({ ...d, [tgl]: d[tgl].map((b) => b.karyawan_id === baris.karyawan_id ? updated : b) }));

    const { data, error } = await supabase.from("audit_kebersihan_roster_harian").upsert({
      id: baris.roster_id ?? undefined,
      tanggal: tgl, karyawan_id: baris.karyawan_id, shift_id: baris.shift_id,
      nama_tugas_datang: updated.tugas_datang.trim() || null, nama_tugas: updated.tugas_pulang.trim(),
      created_by: user?.nama ?? null, is_aktif: true,
    }, { onConflict: "tanggal,karyawan_id" }).select("id").single();

    setSavingKey(null);
    if (error) { setErr(error.message); return; }
    const newId = (data as { id: string } | null)?.id ?? baris.roster_id;
    setDataHari((d) => ({ ...d, [tgl]: d[tgl].map((b) => b.karyawan_id === baris.karyawan_id ? { ...updated, roster_id: newId } : b) }));
    if (nilai.trim() && !daftarTugas.includes(nilai.trim())) {
      setDaftarTugas((prev) => Array.from(new Set([...prev, nilai.trim()])).sort((a, b) => a.localeCompare(b)));
    }
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }

  function pilihAtauBaru(tgl: string, baris: BarisHari, field: "tugas_datang" | "tugas_pulang", value: string) {
    if (value === OPSI_BARU) {
      const teks = prompt("Tulis tugas baru:");
      if (teks && teks.trim()) simpanSel(tgl, baris, field, teks.trim());
      return;
    }
    simpanSel(tgl, baris, field, value);
  }

  async function salinDariMingguLalu() {
    const totalIsi = Object.values(dataHari).reduce((n, rows) => n + rows.filter((r) => r.tugas_pulang).length, 0);
    if (totalIsi > 0 && !confirm("Minggu ini sudah ada isian. Tetap salin dari minggu lalu? (baris yang sudah diisi tidak akan ditimpa)")) return;
    setErr("");
    const seninLalu = addDaysStr(seninAwal, -7);
    const { data: lama } = await supabase.from("audit_kebersihan_roster_harian")
      .select("tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang")
      .gte("tanggal", seninLalu).lte("tanggal", addDaysStr(seninLalu, 6)).eq("is_aktif", true);
    const lamaRows = (lama as { tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null }[] | null) ?? [];
    if (lamaRows.length === 0) { setErr("Minggu lalu tidak ada data untuk disalin."); return; }
    const existing = new Set<string>();
    Object.entries(dataHari).forEach(([tgl, rows]) => rows.forEach((r) => { if (r.tugas_pulang) existing.add(`${tgl}|${r.karyawan_id}`); }));
    const baru = lamaRows
      .map((r) => ({ ...r, tanggal: addDaysStr(r.tanggal, 7) }))
      .filter((r) => !existing.has(`${r.tanggal}|${r.karyawan_id}`))
      .map((r) => ({ ...r, created_by: user?.nama ?? null, is_aktif: true }));
    if (baru.length > 0) await supabase.from("audit_kebersihan_roster_harian").upsert(baru, { onConflict: "tanggal,karyawan_id" });
    muatMinggu();
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-teal-500" />
        <h1 className="text-xl font-bold text-gray-800">Roster Job Desc</h1>
      </div>
      <p className="text-sm text-gray-500">
        Nama karyawan otomatis dari jadwal shift. Job Desc Pulang wajib (ini yang diaudit SPV setiap hari); Job Desc Datang opsional, cuma tampil ke karyawan di Dashboard Saya. Klik dropdown langsung tersimpan.
      </p>

      <div className="card flex items-center justify-between gap-2">
        <button onClick={() => setSeninAwal(addDaysStr(seninAwal, -7))} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-800">{labelTglPendek(hariList[0])} – {labelTglPendek(hariList[6])} {hariList[0].slice(0, 4)}</p>
          <button onClick={salinDariMingguLalu} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 mx-auto mt-1">
            <Copy size={12} /> Salin dari minggu lalu
          </button>
        </div>
        <button onClick={() => setSeninAwal(addDaysStr(seninAwal, 7))} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><ChevronRight size={18} /></button>
      </div>

      {err && <p className="text-sm text-red-500 text-center">{err}</p>}

      {loading ? <p className="text-gray-400 text-sm text-center py-6">Memuat…</p> : (
        <div className="space-y-2">
          {hariList.map((tgl) => {
            const dow = new Date(`${tgl}T00:00:00+07:00`).getDay();
            const rows = dataHari[tgl] ?? [];
            const jumlahIsi = rows.filter((r) => r.tugas_pulang).length;
            const buka = expanded === tgl;
            return (
              <div key={tgl} className="card overflow-hidden !p-0">
                <button onClick={() => setExpanded(buka ? null : tgl)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${buka ? "rotate-180" : ""}`} />
                    <span className="font-semibold text-sm text-gray-700">{HARI[dow]}, {labelTglPendek(tgl)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{rows.length === 0 ? "Tidak ada shift" : `${jumlahIsi}/${rows.length} diisi`}</span>
                </button>

                {buka && (
                  <div className="px-4 pb-4">
                    {rows.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada jadwal shift untuk tanggal ini (isi dulu jadwal shift-nya).</p>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm min-w-[560px]">
                          <thead>
                            <tr className="text-left text-[11px] text-gray-400 uppercase">
                              <th className="font-semibold pb-1.5 pr-2">Nama</th>
                              <th className="font-semibold pb-1.5 pr-2">Job Desc Datang</th>
                              <th className="font-semibold pb-1.5 pr-2">Job Desc Pulang</th>
                              <th className="w-5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const key = `${tgl}|${r.karyawan_id}`;
                              return (
                                <tr key={r.karyawan_id} className="border-t border-gray-50">
                                  <td className="py-1.5 pr-2 align-top">
                                    <p className="font-medium text-gray-700">{r.nama}</p>
                                    {r.shift_nama && <p className="text-[10px] text-gray-400">{r.shift_nama}</p>}
                                  </td>
                                  <td className="py-1.5 pr-2 align-top">
                                    <select className="input text-xs py-1.5" value={r.tugas_datang}
                                      onChange={(e) => pilihAtauBaru(tgl, r, "tugas_datang", e.target.value)}>
                                      <option value="">—</option>
                                      {r.tugas_datang && !daftarTugas.includes(r.tugas_datang) && <option value={r.tugas_datang}>{r.tugas_datang}</option>}
                                      {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                                      <option value={OPSI_BARU}>+ Tugas baru…</option>
                                    </select>
                                  </td>
                                  <td className="py-1.5 pr-2 align-top">
                                    <select className="input text-xs py-1.5" value={r.tugas_pulang}
                                      onChange={(e) => pilihAtauBaru(tgl, r, "tugas_pulang", e.target.value)}>
                                      <option value="">Pilih…</option>
                                      {r.tugas_pulang && !daftarTugas.includes(r.tugas_pulang) && <option value={r.tugas_pulang}>{r.tugas_pulang}</option>}
                                      {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                                      <option value={OPSI_BARU}>+ Tugas baru…</option>
                                    </select>
                                  </td>
                                  <td className="py-1.5 align-top text-center">
                                    {savingKey === key && <span className="text-[10px] text-gray-400">…</span>}
                                    {savedKey === key && <Check size={13} className="text-green-500" />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
