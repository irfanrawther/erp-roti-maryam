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
  id: string; tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null; urutan: number;
  karyawan: { nama: string } | null; shift_master: { nama_shift: string } | null;
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
  const [daftarTugas, setDaftarTugas] = useState<string[]>(TUGAS_AWAL);

  const [tambahUntuk, setTambahUntuk] = useState<string | null>(null); // tanggal yang lagi diisi form tambah
  const [fKaryawanId, setFKaryawanId] = useState("");
  const [fShiftId, setFShiftId] = useState("");
  const [fTugasDatang, setFTugasDatang] = useState("");
  const [fTugasDatangBaru, setFTugasDatangBaru] = useState(false);
  const [fTugas, setFTugas] = useState("");
  const [fTugasBaru, setFTugasBaru] = useState(false);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
    fetchMaster();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMaster = useCallback(async () => {
    const [kRes, sRes, tRes] = await Promise.all([
      supabase.from("karyawan").select("id, nama, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("shift_master").select("id, nama_shift, jam_masuk").order("nama_shift"),
      supabase.from("audit_kebersihan_roster_harian").select("nama_tugas, nama_tugas_datang").limit(2000),
    ]);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setShifts((sRes.data as ShiftMaster[]) ?? []);
    const histRows = (tRes.data as { nama_tugas: string; nama_tugas_datang: string | null }[] | null) ?? [];
    const histSet = new Set<string>(TUGAS_AWAL);
    histRows.forEach((r) => { if (r.nama_tugas) histSet.add(r.nama_tugas); if (r.nama_tugas_datang) histSet.add(r.nama_tugas_datang); });
    setDaftarTugas(Array.from(histSet).sort((a, b) => a.localeCompare(b)));
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("audit_kebersihan_roster_harian")
      .select("id, tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang, urutan, karyawan:karyawan_id(nama), shift_master:shift_id(nama_shift)")
      .gte("tanggal", hariList[0]).lte("tanggal", hariList[6]).eq("is_aktif", true)
      .order("tanggal").order("urutan");
    setRows((data as unknown as RosterRow[]) ?? []);
    setLoading(false);
  }, [hariList]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function bukaForm(tanggal: string) {
    setTambahUntuk(tanggal); setFKaryawanId(""); setFShiftId("");
    setFTugasDatang(""); setFTugasDatangBaru(false); setFTugas(""); setFTugasBaru(false); setErr("");
  }

  async function tambahBaris() {
    if (!tambahUntuk || !fKaryawanId || !fTugas.trim()) { setErr("Karyawan dan job desc pulang wajib diisi."); return; }
    setBusy(true); setErr("");
    const urutan = rows.filter((r) => r.tanggal === tambahUntuk).length;
    const { error } = await supabase.from("audit_kebersihan_roster_harian").upsert({
      tanggal: tambahUntuk, karyawan_id: fKaryawanId, shift_id: fShiftId || null,
      nama_tugas_datang: fTugasDatang.trim() || null, nama_tugas: fTugas.trim(),
      urutan, created_by: user?.nama ?? null, is_aktif: true,
    }, { onConflict: "tanggal,karyawan_id" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDaftarTugas((prev) => {
      const next = new Set(prev);
      next.add(fTugas.trim());
      if (fTugasDatang.trim()) next.add(fTugasDatang.trim());
      return Array.from(next).sort((a, b) => a.localeCompare(b));
    });
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
      .select("tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang, urutan")
      .gte("tanggal", seninLalu).lte("tanggal", addDaysStr(seninLalu, 6)).eq("is_aktif", true);
    const lamaRows = (lama as { tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null; urutan: number }[] | null) ?? [];
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
        <h1 className="text-xl font-bold text-gray-800">Roster Job Desc</h1>
      </div>
      <p className="text-sm text-gray-500">
        Isi siapa kerja apa untuk minggu depan. Job Desc Pulang wajib diisi (ini yang diaudit SPV setiap hari); Job Desc Datang opsional, cuma tampil ke karyawan di Dashboard Saya. Assignment boleh beda-beda tiap minggu.
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
                      {r.nama_tugas_datang && <p className="text-xs text-gray-500 truncate">Datang: {r.nama_tugas_datang}</p>}
                      <p className="text-xs text-gray-500 truncate">Pulang: {r.nama_tugas}</p>
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
                    <div>
                      <label className="text-[11px] text-gray-500 mb-0.5 block">Job desc datang (opsional)</label>
                      {fTugasDatangBaru ? (
                        <div className="flex gap-1.5">
                          <input className="input text-sm flex-1" placeholder="Tulis tugas baru…" value={fTugasDatang} onChange={(e) => setFTugasDatang(e.target.value)} autoFocus />
                          <button onClick={() => { setFTugasDatangBaru(false); setFTugasDatang(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Batal</button>
                        </div>
                      ) : (
                        <select className="input text-sm" value={fTugasDatang}
                          onChange={(e) => { if (e.target.value === OPSI_BARU) { setFTugasDatangBaru(true); setFTugasDatang(""); } else setFTugasDatang(e.target.value); }}>
                          <option value="">Tidak ada / pilih…</option>
                          {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value={OPSI_BARU}>+ Tugas baru…</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 mb-0.5 block">Job desc pulang — wajib, ini yang diaudit</label>
                      {fTugasBaru ? (
                        <div className="flex gap-1.5">
                          <input className="input text-sm flex-1" placeholder="Tulis tugas baru…" value={fTugas} onChange={(e) => setFTugas(e.target.value)} autoFocus />
                          <button onClick={() => { setFTugasBaru(false); setFTugas(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Batal</button>
                        </div>
                      ) : (
                        <select className="input text-sm" value={fTugas}
                          onChange={(e) => { if (e.target.value === OPSI_BARU) { setFTugasBaru(true); setFTugas(""); } else setFTugas(e.target.value); }}>
                          <option value="">Pilih tugas…</option>
                          {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value={OPSI_BARU}>+ Tugas baru…</option>
                        </select>
                      )}
                    </div>
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
