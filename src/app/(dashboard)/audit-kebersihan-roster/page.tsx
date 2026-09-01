"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { ClipboardList, ChevronLeft, ChevronRight, Plus, Trash2, Copy } from "lucide-react";

interface Karyawan { id: string; nama: string; kategori_dokumen: string | null }
interface ShiftMaster { id: string; nama_shift: string; jam_masuk: string }
interface RosterRow {
  id: string; tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; urutan: number;
  karyawan: { nama: string } | null; shift_master: { nama_shift: string } | null;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function addDaysStr(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00+07:00`); d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
// Senin minggu yang memuat tanggal `iso`
function seninMinggu(iso: string): string {
  const d = new Date(`${iso}T00:00:00+07:00`);
  const dow = d.getDay(); // 0=Minggu..6=Sabtu
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [seninAwal, setSeninAwal] = useState(() => addDaysStr(seninMinggu(todayWIB()), 7)); // default: minggu depan
  const hariList = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysStr(seninAwal, i)), [seninAwal]);

  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [shifts, setShifts] = useState<ShiftMaster[]>([]);
  const [rows, setRows] = useState<RosterRow[]>([]);

  const [tambahUntuk, setTambahUntuk] = useState<string | null>(null); // tanggal yang lagi diisi form tambah
  const [fKaryawanId, setFKaryawanId] = useState("");
  const [fShiftId, setFShiftId] = useState("");
  const [fTugas, setFTugas] = useState("");

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
    fetchMaster();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMaster = useCallback(async () => {
    const [kRes, sRes] = await Promise.all([
      supabase.from("karyawan").select("id, nama, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("shift_master").select("id, nama_shift, jam_masuk").order("nama_shift"),
    ]);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setShifts((sRes.data as ShiftMaster[]) ?? []);
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("audit_kebersihan_roster_harian")
      .select("id, tanggal, karyawan_id, shift_id, nama_tugas, urutan, karyawan:karyawan_id(nama), shift_master:shift_id(nama_shift)")
      .gte("tanggal", hariList[0]).lte("tanggal", hariList[6]).eq("is_aktif", true)
      .order("tanggal").order("urutan");
    setRows((data as unknown as RosterRow[]) ?? []);
    setLoading(false);
  }, [hariList]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function bukaForm(tanggal: string) {
    setTambahUntuk(tanggal); setFKaryawanId(""); setFShiftId(""); setFTugas(""); setErr("");
  }

  async function tambahBaris() {
    if (!tambahUntuk || !fKaryawanId || !fTugas.trim()) { setErr("Karyawan dan tugas wajib diisi."); return; }
    setBusy(true); setErr("");
    const urutan = rows.filter((r) => r.tanggal === tambahUntuk).length;
    const { error } = await supabase.from("audit_kebersihan_roster_harian").upsert({
      tanggal: tambahUntuk, karyawan_id: fKaryawanId, shift_id: fShiftId || null, nama_tugas: fTugas.trim(),
      urutan, created_by: user?.nama ?? null, is_aktif: true,
    }, { onConflict: "tanggal,karyawan_id" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setTambahUntuk(null);
    fetchRows();
  }

  async function hapusBaris(id: string) {
    if (!confirm("Hapus baris ini?")) return;
    setBusy(true);
    await supabase.from("audit_kebersihan_roster_harian").delete().eq("id", id);
    setBusy(false);
    fetchRows();
  }

  async function salinDariMingguLalu() {
    if (rows.length > 0 && !confirm("Minggu ini sudah ada isian. Tetap salin dari minggu lalu? (baris yang sudah ada tidak akan ditimpa)")) return;
    setBusy(true); setErr("");
    const seninLalu = addDaysStr(seninAwal, -7);
    const { data: lama } = await supabase.from("audit_kebersihan_roster_harian")
      .select("tanggal, karyawan_id, shift_id, nama_tugas, urutan")
      .gte("tanggal", seninLalu).lte("tanggal", addDaysStr(seninLalu, 6)).eq("is_aktif", true);
    const lamaRows = (lama as { tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; urutan: number }[] | null) ?? [];
    if (lamaRows.length === 0) { setErr("Minggu lalu tidak ada data untuk disalin."); setBusy(false); return; }
    const existing = new Set(rows.map((r) => `${r.tanggal}|${r.karyawan_id}`));
    const baru = lamaRows
      .map((r) => ({ ...r, tanggal: addDaysStr(r.tanggal, 7) }))
      .filter((r) => !existing.has(`${r.tanggal}|${r.karyawan_id}`))
      .map((r) => ({ ...r, created_by: user?.nama ?? null, is_aktif: true }));
    if (baru.length > 0) {
      await supabase.from("audit_kebersihan_roster_harian").upsert(baru, { onConflict: "tanggal,karyawan_id" });
    }
    setBusy(false);
    fetchRows();
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-teal-500" />
        <h1 className="text-xl font-bold text-gray-800">Roster Job Desc Pulang</h1>
      </div>
      <p className="text-sm text-gray-500">
        Isi siapa kerja apa (tugas pulang) untuk minggu depan — ini yang akan diaudit SPV tiap hari. Assignment boleh beda-beda tiap minggu.
      </p>

      <div className="card flex items-center justify-between gap-2">
        <button onClick={() => setSeninAwal(addDaysStr(seninAwal, -7))} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-800">{labelTglPendek(hariList[0])} – {labelTglPendek(hariList[6])} {hariList[0].slice(0, 4)}</p>
          <button onClick={salinDariMingguLalu} disabled={busy}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 mx-auto mt-1 disabled:opacity-40">
            <Copy size={12} /> Salin dari minggu lalu
          </button>
        </div>
        <button onClick={() => setSeninAwal(addDaysStr(seninAwal, 7))} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><ChevronRight size={18} /></button>
      </div>

      {err && !tambahUntuk && <p className="text-sm text-red-500 text-center">{err}</p>}

      {loading ? <p className="text-gray-400 text-sm text-center py-6">Memuat…</p> : (
        <div className="space-y-3">
          {hariList.map((tgl) => {
            const dow = new Date(`${tgl}T00:00:00+07:00`).getDay();
            const rowsHari = rows.filter((r) => r.tanggal === tgl);
            return (
              <div key={tgl} className="card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-gray-700">{HARI[dow]}, {labelTglPendek(tgl)}</p>
                  <button onClick={() => bukaForm(tgl)} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    <Plus size={12} /> Tambah
                  </button>
                </div>

                {rowsHari.length === 0 && tambahUntuk !== tgl && <p className="text-xs text-gray-400 py-1">Belum ada assignment</p>}

                {rowsHari.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">
                        <b>{r.karyawan?.nama}</b>{r.shift_master && <span className="text-gray-400"> · {r.shift_master.nama_shift}</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{r.nama_tugas}</p>
                    </div>
                    <button onClick={() => hapusBaris(r.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}

                {tambahUntuk === tgl && (
                  <div className="rounded-xl bg-teal-50 border border-teal-100 p-2.5 space-y-2 mt-1">
                    <select className="input text-sm" value={fKaryawanId} onChange={(e) => setFKaryawanId(e.target.value)}>
                      <option value="">Pilih karyawan…</option>
                      {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                    <select className="input text-sm" value={fShiftId} onChange={(e) => setFShiftId(e.target.value)}>
                      <option value="">Shift (opsional)…</option>
                      {shifts.map((s) => <option key={s.id} value={s.id}>{s.nama_shift}</option>)}
                    </select>
                    <input className="input text-sm" placeholder="Job desc pulang (mis. Cuci Mesin)" value={fTugas} onChange={(e) => setFTugas(e.target.value)} />
                    {err && <p className="text-xs text-red-500">{err}</p>}
                    <div className="flex gap-2">
                      <button onClick={tambahBaris} disabled={busy} className="flex-1 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-40">Simpan</button>
                      <button onClick={() => setTambahUntuk(null)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50">Batal</button>
                    </div>
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
