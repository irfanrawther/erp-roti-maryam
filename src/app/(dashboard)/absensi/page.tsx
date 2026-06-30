"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, hashPin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { ID_MONTHS } from "@/components/RiwayatFilter";
import { CalendarClock, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, Layers, MapPin, Crosshair } from "lucide-react";

interface Karyawan {
  id: string;
  nama: string;
  jabatan: string | null;
  no_hp: string | null;
  tanggal_masuk_kerja: string | null;
  user_id: string | null;
  status: "aktif" | "nonaktif";
  created_at: string;
}
interface ErpUser { id: string; nama: string }
interface Shift   { id: string; nama_shift: string; jam_masuk: string; jam_pulang: string }
interface Assignment { id: string; karyawan_id: string; tanggal: string; shift_id: string | null; is_libur: boolean }

// Warna per shift (by index 0-3) + libur
const SHIFT_COLORS = [
  "bg-green-100 text-green-700 border-green-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-purple-100 text-purple-700 border-purple-200",
];
const LIBUR_COLOR = "bg-gray-200 text-gray-500 border-gray-300";

export default function AbsensiPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"karyawan" | "shift" | "pengaturan">("karyawan");

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [erpUsers,     setErpUsers]     = useState<ErpUser[]>([]);
  const [shifts,       setShifts]       = useState<Shift[]>([]);

  // ── Route guard: Super Admin only ──
  useEffect(() => {
    const u = getUserSession();
    setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [kRes, uRes, sRes] = await Promise.all([
      supabase.from("karyawan").select("id, nama, jabatan, no_hp, tanggal_masuk_kerja, user_id, status, created_at").order("nama"),
      supabase.from("users").select("id, nama").order("nama"),
      supabase.from("shift_master").select("id, nama_shift, jam_masuk, jam_pulang").order("nama_shift"),
    ]);
    if (kRes.data) setKaryawanList(kRes.data as Karyawan[]);
    if (uRes.data) setErpUsers(uRes.data as ErpUser[]);
    if (sRes.data) setShifts(sRes.data as Shift[]);
  }

  const shiftIndex = (id: string | null) => shifts.findIndex((s) => s.id === id);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <CalendarClock size={20} className="text-amber-500" />
        <h1 className="text-xl font-bold text-gray-800">Absensi</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 max-w-xl">
        {([["karyawan", "Data Karyawan"], ["shift", "Atur Jadwal Shift"], ["pengaturan", "Pengaturan Lokasi"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "karyawan" && (
        <DataKaryawan karyawanList={karyawanList} erpUsers={erpUsers} onChange={fetchAll} />
      )}
      {tab === "shift" && (
        <AturShift karyawanList={karyawanList.filter((k) => k.status === "aktif")} shifts={shifts} shiftIndex={shiftIndex} userName={user?.nama ?? ""} />
      )}
      {tab === "pengaturan" && (
        <PengaturanLokasi userName={user?.nama ?? ""} />
      )}
    </div>
  );
}

// ══════════════════════ TAB 3: PENGATURAN LOKASI ══════════════════════
function PengaturanLokasi({ userName }: { userName: string }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("pengaturan_absensi")
      .select("id, latitude_dapur, longitude_dapur, radius_meter, updated_at").limit(1).maybeSingle();
    const r = data as { id: string; latitude_dapur: number; longitude_dapur: number; radius_meter: number; updated_at: string } | null;
    if (r) {
      setRowId(r.id);
      setLat(String(r.latitude_dapur)); setLng(String(r.longitude_dapur));
      setRadius(String(r.radius_meter)); setUpdatedAt(r.updated_at);
    }
  }

  function gunakanLokasiSaya() {
    setGpsBusy(true); setErr(""); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude)); setGpsBusy(false); setMsg("Lokasi device diambil. Jangan lupa Simpan."); },
      () => { setErr("Tidak bisa ambil lokasi. Izinkan akses GPS di browser."); setGpsBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    setErr(""); setMsg("");
    const latN = parseFloat(lat), lngN = parseFloat(lng), radN = parseInt(radius);
    if (isNaN(latN) || isNaN(lngN)) { setErr("Latitude & longitude harus angka"); return; }
    if (isNaN(radN) || radN <= 0)   { setErr("Radius harus angka > 0"); return; }
    setBusy(true);
    const payload = { latitude_dapur: latN, longitude_dapur: lngN, radius_meter: radN, updated_by: userName, updated_at: new Date().toISOString() };
    const { error } = rowId
      ? await supabase.from("pengaturan_absensi").update(payload).eq("id", rowId)
      : await supabase.from("pengaturan_absensi").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg("✓ Pengaturan lokasi tersimpan");
    load();
  }

  return (
    <div className="card max-w-md space-y-4">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-amber-500" />
        <h2 className="font-semibold text-gray-700 text-sm">Titik Lokasi Dapur & Radius</h2>
      </div>

      <button onClick={gunakanLokasiSaya} disabled={gpsBusy}
        className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2">
        <Crosshair size={16} /> {gpsBusy ? "Mengambil lokasi..." : "Gunakan Lokasi Saya Sekarang"}
      </button>
      <p className="text-[11px] text-gray-400 -mt-2">Tips: buka halaman ini saat berada di dapur, klik tombol di atas, lalu Simpan.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Latitude</label>
          <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-6.xxxxxx" />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.xxxxxx" />
        </div>
      </div>
      <div>
        <label className="label">Radius (meter)</label>
        <input className="input" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ""))} placeholder="100" />
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {updatedAt && <p className="text-[11px] text-gray-400">Terakhir diperbarui: {new Date(updatedAt).toLocaleString("id-ID")}</p>}

      <button onClick={save} disabled={busy} className="btn-primary w-full">{busy ? "Menyimpan..." : "Simpan Pengaturan"}</button>
    </div>
  );
}

// ══════════════════════ TAB 1: DATA KARYAWAN ══════════════════════
function DataKaryawan({ karyawanList, erpUsers, onChange }: {
  karyawanList: Karyawan[]; erpUsers: ErpUser[]; onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editRow,  setEditRow]  = useState<Karyawan | null>(null);
  const [delRow,   setDelRow]   = useState<Karyawan | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  const [form, setForm] = useState({ nama: "", jabatan: "", no_hp: "", tanggal_masuk: "", pin: "", user_id: "", status: "aktif" as "aktif" | "nonaktif" });

  function openCreate() {
    setEditRow(null);
    setForm({ nama: "", jabatan: "", no_hp: "", tanggal_masuk: "", pin: "", user_id: "", status: "aktif" });
    setErr(""); setShowForm(true);
  }
  function openEdit(k: Karyawan) {
    setEditRow(k);
    setForm({ nama: k.nama, jabatan: k.jabatan ?? "", no_hp: k.no_hp ?? "", tanggal_masuk: k.tanggal_masuk_kerja ?? "", pin: "", user_id: k.user_id ?? "", status: k.status });
    setErr(""); setShowForm(true);
  }

  async function save() {
    setErr("");
    if (!form.nama.trim())    { setErr("Nama wajib diisi"); return; }
    if (!form.jabatan.trim()) { setErr("Jabatan wajib diisi"); return; }
    // PIN wajib saat tambah; saat edit boleh kosong (tidak diubah)
    if (!editRow && !/^\d{6}$/.test(form.pin)) { setErr("PIN absensi harus 6 digit angka"); return; }
    if (editRow && form.pin && !/^\d{6}$/.test(form.pin)) { setErr("PIN absensi harus 6 digit angka"); return; }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        nama: form.nama.trim(), jabatan: form.jabatan.trim(),
        no_hp: form.no_hp.trim() || null,
        tanggal_masuk_kerja: form.tanggal_masuk || null,
        user_id: form.user_id || null,
        status: form.status,
      };
      if (form.pin) payload.pin_absensi = await hashPin(form.pin);

      if (editRow) {
        const { error } = await supabase.from("karyawan").update(payload).eq("id", editRow.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("karyawan").insert(payload);
        if (error) throw new Error(error.message);
      }
      setShowForm(false);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!delRow) return;
    setBusy(true);
    await supabase.from("karyawan").delete().eq("id", delRow.id);
    setDelRow(null); setBusy(false);
    onChange();
  }

  const erpName = (id: string | null) => id ? (erpUsers.find((u) => u.id === id)?.nama ?? "—") : null;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> Tambah Karyawan
        </button>
      </div>

      <div className="card overflow-x-auto">
        {karyawanList.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Belum ada karyawan</p>
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Nama</th>
                <th className="py-2 pr-3">Jabatan</th>
                <th className="py-2 pr-3">No HP</th>
                <th className="py-2 pr-3">Masuk Kerja</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">PIN</th>
                <th className="py-2 pr-3">Link ERP</th>
                <th className="py-2 pr-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {karyawanList.map((k) => (
                <tr key={k.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-gray-800">{k.nama}</td>
                  <td className="py-2.5 pr-3 text-gray-600">{k.jabatan ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-gray-600">{k.no_hp ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-gray-600">{k.tanggal_masuk_kerja ? formatTglID(k.tanggal_masuk_kerja) : "—"}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.status === "aktif" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>{k.status}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-400 tracking-widest">••••••</td>
                  <td className="py-2.5 pr-3">
                    {erpName(k.user_id) ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{erpName(k.user_id)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(k)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50"><Pencil size={14} /></button>
                      <button onClick={() => setDelRow(k)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800">{editRow ? "Edit Karyawan" : "Tambah Karyawan"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="label">Nama *</label>
                <input className="input" value={form.nama} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} placeholder="Nama karyawan" />
              </div>
              <div>
                <label className="label">Jabatan *</label>
                <input className="input" value={form.jabatan} onChange={(e) => setForm((f) => ({ ...f, jabatan: e.target.value }))} placeholder="SPV / Staff Produksi / Kurir..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">No HP</label>
                  <input className="input" value={form.no_hp} onChange={(e) => setForm((f) => ({ ...f, no_hp: e.target.value }))} placeholder="08..." />
                </div>
                <div>
                  <label className="label">Tanggal Masuk</label>
                  <input type="date" className="input" value={form.tanggal_masuk} onChange={(e) => setForm((f) => ({ ...f, tanggal_masuk: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">PIN Absensi {editRow ? <span className="text-gray-400 font-normal">(kosongkan jika tidak diubah)</span> : "*"}</label>
                <input className="input tracking-widest" inputMode="numeric" maxLength={6}
                  value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  placeholder="6 digit" />
              </div>
              <div>
                <label className="label">Link ke User ERP</label>
                <select className="input" value={form.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}>
                  <option value="">Tidak ada / Non-ERP</option>
                  {erpUsers.map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "aktif" | "nonaktif" }))}>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={save} disabled={busy} className="btn-primary flex-1">{busy ? "Menyimpan..." : "Simpan"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 space-y-4">
            <div>
              <p className="font-bold text-gray-800 text-sm">Hapus Karyawan?</p>
              <p className="text-xs text-gray-500 mt-1"><b>{delRow.nama}</b> akan dihapus beserta jadwal shift-nya.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDelRow(null)} disabled={busy} className="btn-secondary flex-1">Batal</button>
              <button onClick={doDelete} disabled={busy} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60">{busy ? "..." : "Hapus"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════ TAB 2: ATUR JADWAL SHIFT ══════════════════════
function AturShift({ karyawanList, shifts, shiftIndex, userName }: {
  karyawanList: Karyawan[]; shifts: Shift[]; shiftIndex: (id: string | null) => number; userName: string;
}) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [editCell, setEditCell] = useState<{ karyawanId: string; tanggal: string } | null>(null);
  const [showMassal, setShowMassal] = useState(false);
  const [busy, setBusy] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const dateStr = (day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const fetchAssign = useCallback(async () => {
    const { data } = await supabase.from("shift_assignment")
      .select("id, karyawan_id, tanggal, shift_id, is_libur")
      .gte("tanggal", monthStart).lte("tanggal", monthEnd);
    if (data) setAssignments(data as Assignment[]);
  }, [monthStart, monthEnd]);

  useEffect(() => { fetchAssign(); }, [fetchAssign]);

  const findAssign = (kid: string, tgl: string) => assignments.find((a) => a.karyawan_id === kid && a.tanggal === tgl);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  // value: shift.id | "libur" | "kosong"
  async function setCell(kid: string, tgl: string, value: string) {
    setBusy(true);
    if (value === "kosong") {
      await supabase.from("shift_assignment").delete().eq("karyawan_id", kid).eq("tanggal", tgl);
    } else {
      await supabase.from("shift_assignment").upsert({
        karyawan_id: kid, tanggal: tgl,
        shift_id: value === "libur" ? null : value,
        is_libur: value === "libur",
        created_by: userName,
      }, { onConflict: "karyawan_id,tanggal" });
    }
    setEditCell(null);
    await fetchAssign();
    setBusy(false);
  }

  function cellLabel(a: Assignment | undefined): { text: string; cls: string } | null {
    if (!a) return null;
    if (a.is_libur) return { text: "Libur", cls: LIBUR_COLOR };
    const idx = shiftIndex(a.shift_id);
    if (idx < 0) return null;
    return { text: `S${idx + 1}`, cls: SHIFT_COLORS[idx % SHIFT_COLORS.length] };
  }

  return (
    <div className="space-y-3">
      {/* Month selector + assign massal */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 p-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
          <span className="font-bold text-gray-700 text-sm w-32 text-center">{ID_MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
        </div>
        <button onClick={() => setShowMassal(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Layers size={15} /> Assign Massal
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {shifts.map((s, i) => (
          <span key={s.id} className={`px-2 py-0.5 rounded-full border ${SHIFT_COLORS[i % SHIFT_COLORS.length]}`}>
            S{i + 1} · {s.jam_masuk.slice(0, 5)}-{s.jam_pulang.slice(0, 5)}
          </span>
        ))}
        <span className={`px-2 py-0.5 rounded-full border ${LIBUR_COLOR}`}>Libur</span>
      </div>

      {karyawanList.length === 0 ? (
        <div className="card"><p className="text-gray-400 text-sm text-center py-8">Belum ada karyawan aktif. Tambah dulu di tab Data Karyawan.</p></div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left text-gray-500 font-semibold border-b border-r border-gray-100 min-w-[120px]">Karyawan</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="px-1 py-2 text-center text-gray-400 font-medium border-b border-gray-100 min-w-[34px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {karyawanList.map((k) => (
                <tr key={k.id}>
                  <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-medium text-gray-700 border-b border-r border-gray-100 whitespace-nowrap">{k.nama}</td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const tgl = dateStr(d);
                    const lbl = cellLabel(findAssign(k.id, tgl));
                    return (
                      <td key={d} className="p-0.5 border-b border-gray-50 text-center">
                        <button onClick={() => setEditCell({ karyawanId: k.id, tanggal: tgl })}
                          className={`w-full h-7 rounded-md text-[10px] font-bold border transition-colors ${lbl ? lbl.cls : "border-transparent text-gray-300 hover:bg-gray-50"}`}>
                          {lbl ? lbl.text : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cell editor popover */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800">
              {karyawanList.find((k) => k.id === editCell.karyawanId)?.nama} · {formatTglID(editCell.tanggal)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {shifts.map((s, i) => (
                <button key={s.id} disabled={busy} onClick={() => setCell(editCell.karyawanId, editCell.tanggal, s.id)}
                  className={`py-2 rounded-lg text-sm font-semibold border ${SHIFT_COLORS[i % SHIFT_COLORS.length]} hover:opacity-80`}>
                  S{i + 1} <span className="font-normal text-[10px]">{s.jam_masuk.slice(0, 5)}</span>
                </button>
              ))}
              <button disabled={busy} onClick={() => setCell(editCell.karyawanId, editCell.tanggal, "libur")}
                className={`py-2 rounded-lg text-sm font-semibold border ${LIBUR_COLOR} hover:opacity-80`}>Libur</button>
              <button disabled={busy} onClick={() => setCell(editCell.karyawanId, editCell.tanggal, "kosong")}
                className="py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Kosongkan</button>
            </div>
          </div>
        </div>
      )}

      {showMassal && (
        <AssignMassal karyawanList={karyawanList} shifts={shifts} userName={userName}
          onClose={() => setShowMassal(false)} onDone={() => { setShowMassal(false); fetchAssign(); }} />
      )}
    </div>
  );
}

// ── Assign Massal modal ──
function AssignMassal({ karyawanList, shifts, userName, onClose, onDone }: {
  karyawanList: Karyawan[]; shifts: Shift[]; userName: string;
  onClose: () => void; onDone: () => void;
}) {
  const [karyawanId, setKaryawanId] = useState(karyawanList[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end,   setEnd]   = useState("");
  const [value, setValue] = useState(shifts[0]?.id ?? "libur"); // shift.id | "libur"
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  async function submit() {
    setErr("");
    if (!karyawanId)     { setErr("Pilih karyawan"); return; }
    if (!start || !end)  { setErr("Isi range tanggal"); return; }
    if (end < start)     { setErr("Tanggal akhir harus ≥ tanggal mulai"); return; }

    // build daftar tanggal
    const rows: { karyawan_id: string; tanggal: string; shift_id: string | null; is_libur: boolean; created_by: string }[] = [];
    const d = new Date(start + "T00:00:00");
    const last = new Date(end + "T00:00:00");
    while (d <= last) {
      rows.push({
        karyawan_id: karyawanId,
        tanggal: d.toLocaleDateString("en-CA"),
        shift_id: value === "libur" ? null : value,
        is_libur: value === "libur",
        created_by: userName,
      });
      d.setDate(d.getDate() + 1);
    }
    setBusy(true);
    const { error } = await supabase.from("shift_assignment").upsert(rows, { onConflict: "karyawan_id,tanggal" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Assign Massal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div>
          <label className="label">Karyawan</label>
          <select className="input" value={karyawanId} onChange={(e) => setKaryawanId(e.target.value)}>
            {karyawanList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Dari Tanggal</label>
            <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Shift</label>
          <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
            {shifts.map((s, i) => <option key={s.id} value={s.id}>Shift {i + 1} ({s.jam_masuk.slice(0, 5)}-{s.jam_pulang.slice(0, 5)})</option>)}
            <option value="libur">Libur</option>
          </select>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={submit} disabled={busy} className="btn-primary flex-1">{busy ? "Menyimpan..." : "Assign"}</button>
        </div>
      </div>
    </div>
  );
}

// ── helper tanggal Indonesia singkat ──
function formatTglID(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${ID_MONTHS[m - 1]?.slice(0, 3)} ${y}`;
}
