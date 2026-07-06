"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, hashPin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { ID_MONTHS } from "@/components/RiwayatFilter";
import { hitungDenda, bulanRange, wibMinutesOfDay, DENDA, JAM_ALPHA, STATUS_LABEL } from "@/lib/absensi";
import { CalendarClock, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, Layers, MapPin, Crosshair, Flag, AlertTriangle, Check, LogOut, FileText } from "lucide-react";

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
interface AbsRow {
  id: string; karyawan_id: string; tanggal: string;
  jam_checkin: string | null; jam_checkout: string | null;
  foto_checkin_url: string | null; lat_checkin: number | null; lng_checkin: number | null;
  status_kehadiran: string; denda: number; denda_dihapus_ampun: boolean;
  menit_telat: number; kategori_telat: string | null; is_flagged: boolean;
}
const ABS_SELECT = "id, karyawan_id, tanggal, jam_checkin, jam_checkout, foto_checkin_url, lat_checkin, lng_checkin, status_kehadiran, denda, denda_dihapus_ampun, menit_telat, kategori_telat, is_flagged";

// Warna dot status absensi
function statusDot(a: AbsRow | undefined): { cls: string; label: string } | null {
  if (!a) return null;
  if (a.status_kehadiran === "alpha")      return { cls: "bg-red-500",    label: "Alpha" };
  if (a.status_kehadiran === "izin")       return { cls: "bg-blue-500",   label: "Izin" };
  if (a.status_kehadiran === "izin_sakit") return { cls: "bg-purple-500", label: "Sakit" };
  if (a.status_kehadiran === "hadir")
    return a.kategori_telat
      ? { cls: "bg-yellow-400", label: `Telat (${a.kategori_telat})` }
      : { cls: "bg-green-500",  label: "Hadir tepat waktu" };
  return null;
}

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
  const [tab, setTab] = useState<"karyawan" | "shift" | "review" | "izin" | "rekap" | "pengaturan">("karyawan");

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
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 max-w-3xl overflow-x-auto">
        {([["karyawan", "Data Karyawan"], ["shift", "Atur Jadwal Shift"], ["review", "Review & Flag"], ["izin", "Lapor Izin"], ["rekap", "Rekap Absensi"], ["pengaturan", "Pengaturan Lokasi"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 whitespace-nowrap py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
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
      {tab === "review" && (
        <ReviewFlag karyawanList={karyawanList} shifts={shifts} userName={user?.nama ?? ""} />
      )}
      {tab === "izin" && (
        <PengajuanIzin userName={user?.nama ?? ""} />
      )}
      {tab === "rekap" && (
        <RekapAbsensi karyawanList={karyawanList} shifts={shifts} />
      )}
      {tab === "pengaturan" && (
        <>
          <PengaturanLokasi userName={user?.nama ?? ""} />
          {/* TEMPORARY - REMOVE BEFORE PRODUCTION */}
          <ResetAbsensiTesting onDone={fetchAll} />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TEMPORARY - REMOVE BEFORE PRODUCTION
// Tombol reset data absensi & hapus karyawan dummy (fase testing).
// ══════════════════════════════════════════════════════════════
function ResetAbsensiTesting({ onDone }: { onDone: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function resetAbsensi() {
    setBusy(true); setMsg("");
    // Hapus SEMUA baris absensi (struktur tabel & data lain tetap)
    await supabase.from("absensi").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setBusy(false); setShowModal(false); setKonfirmasi("");
    setMsg("✓ Data absensi berhasil direset");
    onDone();
  }

  async function hapusDummy() {
    if (!confirm("Hapus semua karyawan dengan jabatan 'Tester' beserta shift & absensinya?")) return;
    setBusy(true); setMsg("");
    // FK ON DELETE CASCADE → shift_assignment & absensi karyawan ini ikut terhapus
    await supabase.from("karyawan").delete().eq("jabatan", "Tester");
    setBusy(false);
    setMsg("✓ Karyawan dummy (Tester) dihapus");
    onDone();
  }

  return (
    <div className="card max-w-md mt-4 border-2 border-red-200 bg-red-50/40 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-red-500" />
        <h2 className="font-bold text-red-600 text-sm">⚠️ RESET DATA ABSENSI (TESTING ONLY)</h2>
      </div>
      <p className="text-xs text-gray-500">Fitur sementara untuk fase testing. Hapus sebelum production.</p>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <div className="flex flex-col gap-2">
        <button onClick={() => { setShowModal(true); setKonfirmasi(""); }} disabled={busy}
          className="w-full py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
          Reset Data Absensi
        </button>
        <button onClick={hapusDummy} disabled={busy}
          className="w-full py-2 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
          Hapus Karyawan Dummy (Tester)
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 className="font-bold text-gray-800">Reset Data Absensi?</h3>
            </div>
            <p className="text-sm text-gray-600">
              Ini akan menghapus <b>SEMUA</b> data absensi, denda, dan flag. Data karyawan & shift assignment <b>TIDAK</b> terhapus. Yakin?
            </p>
            <div>
              <label className="text-xs text-gray-500">Ketik <b>RESET</b> untuk konfirmasi</label>
              <input className="input mt-1" value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} placeholder="RESET" autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} disabled={busy} className="btn-secondary flex-1">Batal</button>
              <button onClick={resetAbsensi} disabled={busy || konfirmasi !== "RESET"}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40">
                {busy ? "Mereset..." : "Konfirmasi Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// END TEMPORARY - REMOVE BEFORE PRODUCTION

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
  const [absensi, setAbsensi] = useState<AbsRow[]>([]);
  const [detailCell, setDetailCell] = useState<{ karyawanId: string; tanggal: string } | null>(null);
  const [editCell, setEditCell] = useState<{ karyawanId: string; tanggal: string } | null>(null);
  const [showMassal, setShowMassal] = useState(false);
  const [busy, setBusy] = useState(false);
  // TEMPORARY - REMOVE BEFORE PRODUCTION
  const [showReset, setShowReset] = useState(false);
  const [resetScope, setResetScope] = useState<"bulan" | "semua">("bulan");
  const [resetKonfirmasi, setResetKonfirmasi] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  // END TEMPORARY

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const dateStr = (day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const HARI_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const dowOf = (day: number) => new Date(year, month - 1, day).getDay(); // 0=Minggu

  const fetchAssign = useCallback(async () => {
    const [aRes, absRes] = await Promise.all([
      supabase.from("shift_assignment").select("id, karyawan_id, tanggal, shift_id, is_libur")
        .gte("tanggal", monthStart).lte("tanggal", monthEnd),
      supabase.from("absensi").select(ABS_SELECT)
        .gte("tanggal", monthStart).lte("tanggal", monthEnd),
    ]);
    if (aRes.data)   setAssignments(aRes.data as Assignment[]);
    if (absRes.data) setAbsensi(absRes.data as AbsRow[]);
  }, [monthStart, monthEnd]);

  useEffect(() => { fetchAssign(); }, [fetchAssign]);

  const findAssign = (kid: string, tgl: string) => assignments.find((a) => a.karyawan_id === kid && a.tanggal === tgl);
  const findAbsen  = (kid: string, tgl: string) => absensi.find((a) => a.karyawan_id === kid && a.tanggal === tgl);

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

  // TEMPORARY - REMOVE BEFORE PRODUCTION
  async function resetJadwal() {
    setBusy(true); setResetMsg("");
    if (resetScope === "semua") {
      // shift_assignment + absensi (denda/flag tersimpan di absensi) — karyawan/shift_master/pengaturan tetap
      await supabase.from("shift_assignment").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("absensi").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      await supabase.from("shift_assignment").delete().gte("tanggal", monthStart).lte("tanggal", monthEnd);
      await supabase.from("absensi").delete().gte("tanggal", monthStart).lte("tanggal", monthEnd);
    }
    setBusy(false); setShowReset(false); setResetKonfirmasi("");
    setResetMsg("✓ Jadwal shift, absensi, dan flag berhasil dikosongkan");
    await fetchAssign();
  }
  // END TEMPORARY

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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMassal(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Layers size={15} /> Assign Massal
          </button>
          {/* TEMPORARY - REMOVE BEFORE PRODUCTION */}
          <button onClick={() => { setShowReset(true); setResetKonfirmasi(""); setResetScope("bulan"); }}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50">
            <Trash2 size={15} /> Kosongkan Jadwal
          </button>
          {/* END TEMPORARY */}
        </div>
      </div>
      {resetMsg && <p className="text-sm text-green-600">{resetMsg}</p>}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {shifts.map((s, i) => (
          <span key={s.id} className={`px-2 py-0.5 rounded-full border ${SHIFT_COLORS[i % SHIFT_COLORS.length]}`}>
            S{i + 1} · {s.jam_masuk.slice(0, 5)}-{s.jam_pulang.slice(0, 5)}
          </span>
        ))}
        <span className={`px-2 py-0.5 rounded-full border ${LIBUR_COLOR}`}>Libur</span>
      </div>

      {/* Legend status absensi */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">Status:</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Hadir</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Telat</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Alpha</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Izin</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Sakit</span>
        <span className="flex items-center gap-1">⚠️ Perlu Review</span>
      </div>

      {karyawanList.length === 0 ? (
        <div className="card"><p className="text-gray-400 text-sm text-center py-8">Belum ada karyawan aktif. Tambah dulu di tab Data Karyawan.</p></div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left text-gray-500 font-semibold border-b border-r border-gray-100 min-w-[120px]">Karyawan</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const dow = dowOf(d);
                  const isMinggu = dow === 0;
                  return (
                    <th key={d} className={`px-1 py-1.5 text-center font-medium border-b border-gray-100 min-w-[34px] ${isMinggu ? "bg-red-50" : ""}`}>
                      <div className={`text-[9px] leading-none ${isMinggu ? "text-red-500 font-bold" : "text-gray-400"}`}>{HARI_ABBR[dow]}</div>
                      <div className={`text-xs leading-tight ${isMinggu ? "text-red-600 font-bold" : "text-gray-500"}`}>{d}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {karyawanList.map((k) => (
                <tr key={k.id}>
                  <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-medium text-gray-700 border-b border-r border-gray-100 whitespace-nowrap">{k.nama}</td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const tgl = dateStr(d);
                    const isMinggu = dowOf(d) === 0;
                    // Default Minggu = Libur bila belum ada assignment
                    const lbl = cellLabel(findAssign(k.id, tgl))
                      ?? (isMinggu ? { text: "Libur", cls: LIBUR_COLOR } : null);
                    const abs = findAbsen(k.id, tgl);
                    const dot = statusDot(abs);
                    return (
                      <td key={d} className={`p-0.5 border-b border-gray-50 text-center ${isMinggu ? "bg-red-50/50" : ""}`}>
                        <div className="relative">
                          <button onClick={() => setEditCell({ karyawanId: k.id, tanggal: tgl })}
                            className={`w-full h-7 rounded-md text-[10px] font-bold border transition-colors ${lbl ? lbl.cls : "border-transparent text-gray-300 hover:bg-gray-50"}`}>
                            {lbl ? lbl.text : "·"}
                          </button>
                          {(dot || abs?.is_flagged) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailCell({ karyawanId: k.id, tanggal: tgl }); }}
                              title={dot?.label ?? "Detail absensi"}
                              className="absolute -top-1 -right-1 flex items-center gap-0.5">
                              {dot && <span className={`w-2.5 h-2.5 rounded-full border border-white ${dot.cls}`} />}
                              {abs?.is_flagged && <span className="text-[9px] leading-none">⚠️</span>}
                            </button>
                          )}
                        </div>
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

      {detailCell && (() => {
        const abs = findAbsen(detailCell.karyawanId, detailCell.tanggal);
        const asg = findAssign(detailCell.karyawanId, detailCell.tanggal);
        const shift = shifts.find((s) => s.id === asg?.shift_id) ?? null;
        const nama = karyawanList.find((k) => k.id === detailCell.karyawanId)?.nama ?? "—";
        return (
          <AbsenDetailModal abs={abs} shift={shift} nama={nama} tanggal={detailCell.tanggal} userName={userName}
            onClose={() => setDetailCell(null)} onSaved={() => { setDetailCell(null); fetchAssign(); }} />
        );
      })()}

      {showMassal && (
        <AssignMassal karyawanList={karyawanList} shifts={shifts} userName={userName}
          onClose={() => setShowMassal(false)} onDone={() => { setShowMassal(false); fetchAssign(); }} />
      )}

      {/* TEMPORARY - REMOVE BEFORE PRODUCTION */}
      {showReset && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-red-600 flex items-center gap-2">⚠️ Kosongkan Jadwal Shift (TESTING)</h3>
            <p className="text-sm text-gray-600">
              Ini akan mengosongkan: (1) Semua jadwal shift, (2) Semua data absensi &amp; denda, (3) Semua flag di Review &amp; Flag. Data karyawan &amp; pengaturan lokasi <b>TIDAK</b> terhapus. Yakin?
            </p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={resetScope === "bulan"} onChange={() => setResetScope("bulan")} />
                Kosongkan bulan ini saja ({ID_MONTHS[month - 1]} {year})
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={resetScope === "semua"} onChange={() => setResetScope("semua")} />
                Kosongkan SEMUA jadwal
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-500">Ketik <b>RESET</b> untuk konfirmasi</label>
              <input className="input mt-1" value={resetKonfirmasi} onChange={(e) => setResetKonfirmasi(e.target.value)} placeholder="RESET" autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowReset(false)} disabled={busy} className="btn-secondary flex-1">Batal</button>
              <button onClick={resetJadwal} disabled={busy || resetKonfirmasi !== "RESET"}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40">
                {busy ? "Mengosongkan..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* END TEMPORARY */}
    </div>
  );
}

// ── Assign Massal modal ──
function AssignMassal({ karyawanList, shifts, userName, onClose, onDone }: {
  karyawanList: Karyawan[]; shifts: Shift[]; userName: string;
  onClose: () => void; onDone: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end,   setEnd]   = useState("");
  const [value, setValue] = useState(shifts[0]?.id ?? "libur"); // shift.id | "libur"
  const [mingguLibur, setMingguLibur] = useState(true); // hari Minggu otomatis Libur
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  const allSelected = karyawanList.length > 0 && selectedIds.length === karyawanList.length;
  function toggleKaryawan(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    setSelectedIds(allSelected ? [] : karyawanList.map((k) => k.id));
  }

  async function submit() {
    setErr("");
    if (selectedIds.length === 0) { setErr("Pilih minimal 1 karyawan"); return; }
    if (!start || !end)  { setErr("Isi range tanggal"); return; }
    if (end < start)     { setErr("Tanggal akhir harus ≥ tanggal mulai"); return; }

    // build daftar tanggal × karyawan terpilih
    const rows: { karyawan_id: string; tanggal: string; shift_id: string | null; is_libur: boolean; created_by: string }[] = [];
    for (const kid of selectedIds) {
      const d = new Date(start + "T00:00:00");
      const last = new Date(end + "T00:00:00");
      while (d <= last) {
        const isMinggu = d.getDay() === 0;
        const libur = value === "libur" || (mingguLibur && isMinggu);
        rows.push({
          karyawan_id: kid,
          tanggal: d.toLocaleDateString("en-CA"),
          shift_id: libur ? null : value,
          is_libur: libur,
          created_by: userName,
        });
        d.setDate(d.getDate() + 1);
      }
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
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Karyawan ({selectedIds.length} dipilih)</label>
            <button type="button" onClick={toggleAll} className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              {allSelected ? "Hapus semua" : "Pilih semua"}
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-1 grid grid-cols-2 gap-0.5">
            {karyawanList.map((k) => {
              const checked = selectedIds.includes(k.id);
              return (
                <button key={k.id} type="button" onClick={() => toggleKaryawan(k.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${checked ? "bg-amber-50 text-amber-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                  <span className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${checked ? "bg-amber-500 border-amber-500 text-white" : "border-gray-300"}`}>
                    {checked && <Check size={11} />}
                  </span>
                  <span className="truncate">{k.nama}</span>
                </button>
              );
            })}
          </div>
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
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={mingguLibur} onChange={(e) => setMingguLibur(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-500" />
          Hari Minggu otomatis <span className="font-semibold">Libur</span>
        </label>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Batal</button>
          <button onClick={submit} disabled={busy} className="btn-primary flex-1">{busy ? "Menyimpan..." : "Assign"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════ TAB 4: REVIEW & FLAG ══════════════════════
interface AbsRow {
  id: string; karyawan_id: string; tanggal: string; shift_id: string | null;
  jam_checkin: string | null; menit_telat: number; kategori_telat: string | null;
  denda: number; denda_dihapus_ampun: boolean; status_kehadiran: string;
  is_flagged: boolean; flag_reason: string | null; shift_id_koreksi: string | null;
  is_override: boolean; catatan_super_admin: string | null;
  is_checkout_flagged?: boolean; flag_reason_checkout?: string | null;
  karyawan: { nama: string } | null;
  shift_master: { nama_shift: string; jam_masuk: string; jam_pulang: string } | null;
}
function rupiah(n: number) { return "Rp " + (n || 0).toLocaleString("id-ID"); }
function jamDari(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
}

function ReviewFlag({ karyawanList, shifts, userName }: {
  karyawanList: Karyawan[]; shifts: Shift[]; userName: string;
}) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows]   = useState<AbsRow[]>([]);
  const [catatanMap, setCatatanMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fTanggal, setFTanggal] = useState("");     // filter Semua Absensi: "" = semua tanggal di bulan ini
  const [fStatus,  setFStatus]  = useState("semua"); // semua | K1 | K2 | K3 | alpha | izin | izin_sakit
  const [coJam,   setCoJam]   = useState<Record<string, string>>({});   // jam pulang manual (lupa checkout)
  const [coMenit, setCoMenit] = useState<Record<string, string>>({});

  const daysInMonth = new Date(year, month, 0).getDate();
  const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const mEnd   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    // 1) Alpha on-demand: assignment (non-libur) yg tanggalnya sudah lewat 17:00 & belum ada absensi
    const [asgRes, absExist] = await Promise.all([
      supabase.from("shift_assignment").select("karyawan_id, tanggal, shift_id, is_libur").eq("is_libur", false).not("shift_id", "is", null).gte("tanggal", mStart).lte("tanggal", mEnd),
      supabase.from("absensi").select("karyawan_id, tanggal").gte("tanggal", mStart).lte("tanggal", mEnd),
    ]);
    const have = new Set(((absExist.data as { karyawan_id: string; tanggal: string }[] | null) ?? []).map((a) => `${a.karyawan_id}|${a.tanggal}`));
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const nowMin = wibMinutesOfDay(new Date());
    const ins: Record<string, unknown>[] = [];
    for (const a of ((asgRes.data as { karyawan_id: string; tanggal: string; shift_id: string }[] | null) ?? [])) {
      const passed = a.tanggal < todayStr || (a.tanggal === todayStr && nowMin >= JAM_ALPHA * 60);
      if (!passed || have.has(`${a.karyawan_id}|${a.tanggal}`)) continue;
      ins.push({ karyawan_id: a.karyawan_id, tanggal: a.tanggal, shift_id: a.shift_id, status_kehadiran: "alpha", denda: DENDA.ALPHA });
    }
    if (ins.length) await supabase.from("absensi").upsert(ins, { onConflict: "karyawan_id,tanggal" });

    // 2) Fetch rows lengkap
    const { data } = await supabase.from("absensi")
      .select("id, karyawan_id, tanggal, shift_id, jam_checkin, jam_checkout, menit_telat, kategori_telat, denda, denda_dihapus_ampun, status_kehadiran, is_flagged, flag_reason, shift_id_koreksi, is_override, catatan_super_admin, is_checkout_flagged, flag_reason_checkout, karyawan:karyawan_id(nama), shift_master:shift_id(nama_shift, jam_masuk, jam_pulang)")
      .gte("tanggal", mStart).lte("tanggal", mEnd).order("tanggal", { ascending: false });
    setRows((data as unknown as AbsRow[]) ?? []);
    setLoading(false);
  }, [mStart, mEnd]);

  useEffect(() => { refresh(); }, [refresh]);

  async function countK1Ampun(karyawanId: string, tanggal: string, excludeId?: string) {
    const { start, end } = bulanRange(tanggal);
    let q = supabase.from("absensi").select("id", { count: "exact", head: true })
      .eq("karyawan_id", karyawanId).eq("kategori_telat", "K1").eq("denda_dihapus_ampun", true)
      .gte("tanggal", start).lte("tanggal", end);
    if (excludeId) q = q.neq("id", excludeId);
    return (await q).count ?? 0;
  }

  // Koreksi shift asli → recalc denda
  async function koreksiShift(row: AbsRow, newShiftId: string) {
    const shift = shifts.find((s) => s.id === newShiftId);
    if (!shift || !row.jam_checkin) return;
    const k1 = await countK1Ampun(row.karyawan_id, row.tanggal, row.id);
    const res = hitungDenda(shift.jam_masuk, new Date(row.jam_checkin), k1);
    await supabase.from("absensi").update({
      shift_id_koreksi: newShiftId,
      menit_telat: res.menit_telat, kategori_telat: res.kategori_telat,
      denda: res.denda, denda_dihapus_ampun: res.denda_dihapus_ampun,
      is_flagged: res.is_flagged, flag_reason: res.flag_reason,
    }).eq("id", row.id);
    refresh();
  }
  async function hapusDenda(row: AbsRow) {
    await supabase.from("absensi").update({ denda: 0, is_flagged: false }).eq("id", row.id);
    refresh();
  }
  async function selesaiReview(row: AbsRow) {
    await supabase.from("absensi").update({
      is_override: true, is_flagged: false,
      override_by: userName, override_at: new Date().toISOString(),
      catatan_super_admin: catatanMap[row.id] || row.catatan_super_admin || null,
    }).eq("id", row.id);
    refresh();
  }
  // Koreksi lupa check-out: isi jam pulang manual (di tanggal shift), hapus flag
  async function simpanCheckoutManual(row: AbsRow) {
    const jam = coJam[row.id], menit = coMenit[row.id];
    if (!jam || !menit) return;
    const iso = new Date(`${row.tanggal}T${jam}:${menit}:00+07:00`).toISOString();
    await supabase.from("absensi").update({
      jam_checkout: iso, is_checkout_flagged: false, flag_reason_checkout: null,
      checkout_override_by: userName, checkout_override_at: new Date().toISOString(),
    }).eq("id", row.id);
    setCoJam((m) => { const n = { ...m }; delete n[row.id]; return n; });
    setCoMenit((m) => { const n = { ...m }; delete n[row.id]; return n; });
    refresh();
  }
  async function setStatusIzin(row: AbsRow, status: "izin" | "izin_sakit") {
    await supabase.from("absensi").update({
      status_kehadiran: status, denda: 0, is_flagged: false, is_override: true,
      override_by: userName, override_at: new Date().toISOString(),
      catatan_super_admin: catatanMap[row.id] || row.catatan_super_admin || null,
    }).eq("id", row.id);
    refresh();
  }

  function prevMonth() { setFTanggal(""); if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { setFTanggal(""); if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const flagged = rows.filter((r) => r.is_flagged && !r.is_override);
  const lupaCheckout = rows.filter((r) => r.is_checkout_flagged);
  // Filter untuk tabel "Semua Absensi"
  const filteredRows = rows.filter((r) => {
    if (fTanggal && r.tanggal !== fTanggal) return false;
    if (fStatus !== "semua") {
      if (fStatus === "K1" || fStatus === "K2" || fStatus === "K3") {
        if (r.kategori_telat !== fStatus) return false;
      } else if (r.status_kehadiran !== fStatus) return false;
    }
    return true;
  });
  const alphaRows = rows.filter((r) => r.status_kehadiran === "alpha" && !r.is_override);
  const totalDenda = rows.reduce((s, r) => s + (r.denda || 0), 0);
  const shiftLabel = (id: string | null) => { const i = shifts.findIndex((s) => s.id === id); return i < 0 ? "—" : `S${i + 1}`; };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 p-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
          <span className="font-bold text-gray-700 text-sm w-32 text-center">{ID_MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
        </div>
        <div className="text-sm text-gray-500">Total denda bulan ini: <b className="text-gray-800">{rupiah(totalDenda)}</b></div>
      </div>

      {loading && <p className="text-sm text-gray-400">Memuat...</p>}

      {/* SECTION A — FLAGGED */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Flag size={16} className="text-red-500" />
          <h2 className="font-semibold text-gray-700 text-sm">Perlu Konfirmasi ({flagged.length})</h2>
        </div>
        {flagged.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Tidak ada flag</p>
        ) : flagged.map((r) => (
          <div key={r.id} className="rounded-xl border border-red-100 bg-red-50/40 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm text-gray-800">{r.karyawan?.nama} · {formatTglID(r.tanggal)}</p>
                <p className="text-xs text-gray-500">
                  Shift assign: {r.shift_master?.nama_shift ?? "—"} ({r.shift_master?.jam_masuk.slice(0, 5)}) · Check-in <b>{jamDari(r.jam_checkin)}</b>
                </p>
                <p className="text-xs font-medium text-red-600 mt-0.5">
                  {r.flag_reason === "telat_jauh" ? `Telat jauh (${r.menit_telat} menit)` : "Datang kepagian (>45 mnt sebelum shift)"}
                  {" · "}Denda {rupiah(r.denda)}
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-500">Shift asli karyawan (recalc)</label>
                <select className="input py-1.5 text-sm" value={r.shift_id_koreksi ?? ""} onChange={(e) => e.target.value && koreksiShift(r, e.target.value)}>
                  <option value="">Pilih shift…</option>
                  {shifts.map((s, i) => <option key={s.id} value={s.id}>Shift {i + 1} ({s.jam_masuk.slice(0, 5)})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Catatan</label>
                <input className="input py-1.5 text-sm" value={catatanMap[r.id] ?? ""} onChange={(e) => setCatatanMap((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="opsional" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => hapusDenda(r)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200">Hapus Denda</button>
              <button onClick={() => selesaiReview(r)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600">Selesai Review</button>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION B — ALPHA */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-500" />
          <h2 className="font-semibold text-gray-700 text-sm">Alpha — perlu tindak lanjut ({alphaRows.length})</h2>
        </div>
        {alphaRows.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Tidak ada alpha</p>
        ) : alphaRows.map((r) => (
          <div key={r.id} className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-2">
            <p className="font-semibold text-sm text-gray-800">{r.karyawan?.nama} · {formatTglID(r.tanggal)} <span className="text-orange-600">· Alpha · Denda {rupiah(r.denda)}</span></p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStatusIzin(r, "izin")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200">Ubah → Izin</button>
              <button onClick={() => setStatusIzin(r, "izin_sakit")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200">Ubah → Izin Sakit</button>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION — LUPA CHECK-OUT */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <LogOut size={16} className="text-orange-500" />
          <h2 className="font-semibold text-gray-700 text-sm">Lupa Check-out ({lupaCheckout.length})</h2>
        </div>
        {lupaCheckout.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Tidak ada sesi yang lupa check-out</p>
        ) : lupaCheckout.map((r) => (
          <div key={r.id} className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-2">
            <div>
              <p className="font-semibold text-sm text-gray-800">{r.karyawan?.nama} · shift {formatTglID(r.tanggal)}</p>
              <p className="text-xs text-gray-500">
                {r.shift_master?.nama_shift ?? "—"} · Check-in <b>{jamDari(r.jam_checkin)}</b>
                {r.shift_master?.jam_pulang && <> · Pulang seharusnya <b>{r.shift_master.jam_pulang.slice(0, 5)}</b></>}
              </p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-[11px] text-gray-500">Jam pulang manual</label>
                <div className="flex items-center gap-1.5">
                  <select className="input py-1.5 text-sm" value={coJam[r.id] ?? ""} onChange={(e) => setCoJam((m) => ({ ...m, [r.id]: e.target.value }))}>
                    <option value="">Jam</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="font-bold text-gray-400">:</span>
                  <select className="input py-1.5 text-sm" value={coMenit[r.id] ?? ""} onChange={(e) => setCoMenit((m) => ({ ...m, [r.id]: e.target.value }))}>
                    <option value="">Menit</option>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((mm) => <option key={mm} value={mm}>{mm}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => simpanCheckoutManual(r)} disabled={!coJam[r.id] || !coMenit[r.id]}
                className="btn-primary text-sm py-2 disabled:opacity-40">Simpan Check-out</button>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION C — OVERRIDE MANUAL */}
      <OverrideManual karyawanList={karyawanList} shifts={shifts} userName={userName} onDone={refresh} countK1Ampun={countK1Ampun} />

      {/* RINGKASAN bulan */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-semibold text-gray-700 text-sm">Semua Absensi ({filteredRows.length})</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="input py-1.5 text-sm" value={month} onChange={(e) => { setFTanggal(""); setMonth(Number(e.target.value)); }} title="Pilih bulan">
              {ID_MONTHS.map((nm, i) => <option key={nm} value={i + 1}>{nm}</option>)}
            </select>
            <select className="input py-1.5 text-sm" value={year} onChange={(e) => { setFTanggal(""); setYear(Number(e.target.value)); }} title="Pilih tahun">
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-gray-200">|</span>
            <input type="date" className="input py-1.5 text-sm" min={mStart} max={mEnd}
              value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} title="Filter tanggal (dalam bulan ini)" />
            {fTanggal && (
              <button onClick={() => setFTanggal("")} className="text-xs text-gray-400 hover:text-gray-600" title="Semua tanggal">✕ semua tgl</button>
            )}
            <select className="input py-1.5 text-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="semua">Semua status</option>
              <option value="K1">Telat K1</option>
              <option value="K2">Telat K2</option>
              <option value="K3">Telat K3</option>
              <option value="alpha">Alpha</option>
              <option value="izin">Izin</option>
              <option value="izin_sakit">Izin Sakit</option>
            </select>
          </div>
        </div>
        {filteredRows.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">{rows.length === 0 ? "Belum ada data" : "Tidak ada data untuk filter ini"}</p> : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Karyawan</th><th className="py-2 pr-3">Shift</th>
                <th className="py-2 pr-3">Masuk</th><th className="py-2 pr-3">Telat</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Denda</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 text-gray-600">{formatTglID(r.tanggal)}</td>
                  <td className="py-2 pr-3 font-medium text-gray-800">{r.karyawan?.nama}</td>
                  <td className="py-2 pr-3 text-gray-600">{shiftLabel(r.shift_id_koreksi ?? r.shift_id)}{r.shift_id_koreksi && <span className="text-amber-500 text-[10px]"> ✎</span>}</td>
                  <td className="py-2 pr-3 text-gray-600">{jamDari(r.jam_checkin)}</td>
                  <td className="py-2 pr-3">{r.kategori_telat ? <span className="text-red-500 font-medium">{r.kategori_telat} ({r.menit_telat}′)</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="py-2 pr-3">{STATUS_LABEL[r.status_kehadiran] ?? r.status_kehadiran}{r.denda_dihapus_ampun && <span className="text-green-500 text-[10px]"> (ampun)</span>}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-gray-800">{r.denda ? rupiah(r.denda) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Override manual (lupa check-in / set izin) ──
function OverrideManual({ karyawanList, shifts, userName, onDone, countK1Ampun }: {
  karyawanList: Karyawan[]; shifts: Shift[]; userName: string;
  onDone: () => void; countK1Ampun: (k: string, t: string, e?: string) => Promise<number>;
}) {
  const [karyawanId, setKaryawanId] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [mode, setMode] = useState<"hadir" | "izin" | "izin_sakit">("hadir");
  const [jam, setJam] = useState("");
  const [menit, setMenit] = useState("");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const jamMasuk = jam !== "" && menit !== "" ? `${jam}:${menit}` : "";

  async function submit() {
    setErr(""); setMsg("");
    if (!karyawanId || !tanggal) { setErr("Pilih karyawan & tanggal"); return; }
    if (mode === "hadir" && !jamMasuk) { setErr("Pilih jam & menit masuk"); return; }
    setBusy(true);
    try {
      // shift ter-assign tanggal itu
      const { data: sa } = await supabase.from("shift_assignment")
        .select("shift_id, is_libur, shift_master:shift_id(jam_masuk)")
        .eq("karyawan_id", karyawanId).eq("tanggal", tanggal).maybeSingle();
      const saRow = sa as { shift_id: string | null; is_libur: boolean; shift_master: { jam_masuk: string } | null } | null;
      const shiftId = saRow && !saRow.is_libur ? saRow.shift_id : null;

      const payload: Record<string, unknown> = {
        karyawan_id: karyawanId, tanggal, shift_id: shiftId,
        is_override: true, override_by: userName, override_at: new Date().toISOString(),
        catatan_super_admin: catatan || null, is_flagged: false,
      };

      if (mode === "hadir") {
        const checkinIso = `${tanggal}T${jamMasuk}:00+07:00`;
        payload.jam_checkin = checkinIso;
        payload.status_kehadiran = "hadir";
        if (saRow?.shift_master?.jam_masuk) {
          const k1 = await countK1Ampun(karyawanId, tanggal);
          const res = hitungDenda(saRow.shift_master.jam_masuk, new Date(checkinIso), k1);
          payload.menit_telat = res.menit_telat; payload.kategori_telat = res.kategori_telat;
          payload.denda = res.denda; payload.denda_dihapus_ampun = res.denda_dihapus_ampun;
        } else { payload.denda = 0; payload.kategori_telat = null; payload.menit_telat = 0; }
      } else {
        payload.status_kehadiran = mode; payload.denda = 0; payload.kategori_telat = null; payload.menit_telat = 0;
      }

      const { error } = await supabase.from("absensi").upsert(payload, { onConflict: "karyawan_id,tanggal" });
      if (error) throw new Error(error.message);
      setMsg("✓ Tersimpan"); setJam(""); setMenit(""); setCatatan("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally { setBusy(false); }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-gray-700 text-sm">Override Manual (lupa check-in / set izin)</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Karyawan</label>
          <select className="input" value={karyawanId} onChange={(e) => setKaryawanId(e.target.value)}>
            <option value="">Pilih…</option>
            {karyawanList.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tanggal</label>
          <input type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        <div>
          <label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="hadir">Hadir (input jam masuk)</option>
            <option value="izin">Izin</option>
            <option value="izin_sakit">Izin Sakit</option>
          </select>
        </div>
        {mode === "hadir" && (
          <div>
            <label className="label">Jam Masuk</label>
            <div className="flex items-center gap-2">
              <select className="input" value={jam} onChange={(e) => setJam(e.target.value)}>
                <option value="">Jam</option>
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="font-bold text-gray-400">:</span>
              <select className="input" value={menit} onChange={(e) => setMenit(e.target.value)}>
                <option value="">Menit</option>
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Catatan</label>
          <input className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="opsional" />
        </div>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "Menyimpan..." : "Simpan Override"}</button>
    </div>
  );
}

// ── helper tanggal Indonesia singkat ──
function formatTglID(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${ID_MONTHS[m - 1]?.slice(0, 3)} ${y}`;
}
// "Rabu, 2 Juli 2026" — dengan nama hari
function hariTglID(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// jam WIB (HH:MM) dari timestamptz ISO
function jamWIB(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
}

// ── Modal detail absensi + ubah status manual (dari grid jadwal) ──
function AbsenDetailModal({ abs, shift, nama, tanggal, userName, onClose, onSaved }: {
  abs: AbsRow | undefined; shift: Shift | null; nama: string; tanggal: string; userName: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus]   = useState(abs?.status_kehadiran ?? "hadir");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const [showFull, setShowFull] = useState(false);

  const dot = statusDot(abs);

  async function simpan() {
    if (!abs) { setErr("Belum ada data absensi untuk tanggal ini"); return; }
    setErr(""); setBusy(true);
    const patch: Record<string, unknown> = {
      status_kehadiran: status,
      is_override: true,
      override_by: userName,
      override_at: new Date().toISOString(),
      catatan_super_admin: catatan || null,
    };
    // Izin / Sakit → denda 0. Alpha → denda alpha. Hadir → biarkan denda apa adanya.
    if (status === "izin" || status === "izin_sakit") { patch.denda = 0; patch.is_flagged = false; }
    else if (status === "alpha") { patch.denda = DENDA.ALPHA; }
    const { error } = await supabase.from("absensi").update(patch).eq("id", abs.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <p className="font-bold text-gray-800">Detail Absensi</p>
            <p className="text-xs text-gray-500">{nama} · {formatTglID(tanggal)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {!abs ? (
            <p className="text-gray-400 text-center py-4">Belum ada data absensi untuk tanggal ini.</p>
          ) : (
            <>
              <div className="space-y-0.5">
                <Row label="Shift" value={shift ? `${shift.nama_shift} (${shift.jam_masuk.slice(0,5)}-${shift.jam_pulang.slice(0,5)})` : "-"} />
                <Row label="Status" value={
                  <span className="inline-flex items-center gap-1.5">
                    {dot && <span className={`w-2.5 h-2.5 rounded-full ${dot.cls}`} />}
                    {STATUS_LABEL[abs.status_kehadiran] ?? abs.status_kehadiran}
                    {abs.is_flagged && <span title="Perlu review">⚠️</span>}
                  </span>
                } />
                <Row label="Jam Check-in"  value={jamWIB(abs.jam_checkin)} />
                <Row label="Jam Check-out" value={jamWIB(abs.jam_checkout)} />
                {abs.menit_telat > 0 && <Row label="Menit Telat" value={`${abs.menit_telat} menit`} />}
                <Row label="Denda" value={
                  abs.denda > 0
                    ? (abs.denda_dihapus_ampun
                        ? <span className="text-green-600">Rp {abs.denda.toLocaleString("id-ID")} (ampun)</span>
                        : <span className="text-red-600">Rp {abs.denda.toLocaleString("id-ID")}</span>)
                    : "Rp 0"
                } />
              </div>

              {/* Foto + lokasi */}
              {abs.foto_checkin_url ? (
                <div>
                  <button onClick={() => setShowFull(true)} className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-amber-400">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={abs.foto_checkin_url} alt="foto" className="w-full h-full object-cover" />
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1">Klik foto untuk perbesar</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Tidak ada foto check-in</p>
              )}
              {abs.lat_checkin != null && abs.lng_checkin != null && (
                <a href={`https://maps.google.com/?q=${abs.lat_checkin},${abs.lng_checkin}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-blue-50 text-blue-600 font-semibold text-xs hover:bg-blue-100">
                  <MapPin size={14} /> Lihat Lokasi di Google Maps
                </a>
              )}

              {/* Ubah status manual */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ubah Status Manual</p>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="hadir">Hadir</option>
                  <option value="alpha">Alpha</option>
                  <option value="izin">Izin</option>
                  <option value="izin_sakit">Sakit</option>
                </select>
                <textarea className="input" rows={2} placeholder="Catatan (opsional)…" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                {(status === "izin" || status === "izin_sakit") && <p className="text-[11px] text-green-600">Denda otomatis jadi Rp 0.</p>}
                {err && <p className="text-xs text-red-500">{err}</p>}
                <button onClick={simpan} disabled={busy} className="btn-primary w-full">{busy ? "Menyimpan…" : "Simpan Perubahan"}</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Foto full */}
      {showFull && abs?.foto_checkin_url && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setShowFull(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={abs.foto_checkin_url} alt="foto full" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

// ── Rekap Absensi + Foto (Super Admin) ──
interface RekapRow {
  id: string; karyawan_id: string; tanggal: string;
  jam_checkin: string | null; jam_checkout: string | null;
  foto_checkin_url: string | null; lat_checkin: number | null; lng_checkin: number | null;
  status_kehadiran: string; denda: number; denda_dihapus_ampun: boolean;
  menit_telat: number; kategori_telat: string | null;
}
function RekapAbsensi({ karyawanList, shifts }: { karyawanList: Karyawan[]; shifts: Shift[] }) {
  void shifts;
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows]   = useState<RekapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fotoModal, setFotoModal] = useState<RekapRow | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const mEnd   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const namaOf = (kid: string) => karyawanList.find((k) => k.id === kid)?.nama ?? "—";

  const fetchRekap = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("absensi")
      .select("id, karyawan_id, tanggal, jam_checkin, jam_checkout, foto_checkin_url, lat_checkin, lng_checkin, status_kehadiran, denda, denda_dihapus_ampun, menit_telat, kategori_telat")
      .gte("tanggal", mStart).lte("tanggal", mEnd)
      .order("tanggal", { ascending: false });
    setRows((data as RekapRow[]) ?? []);
    setLoading(false);
  }, [mStart, mEnd]);

  useEffect(() => { fetchRekap(); }, [fetchRekap]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const totalDenda = rows.reduce((s, r) => s + (r.denda_dihapus_ampun ? 0 : r.denda), 0);

  return (
    <div className="space-y-3">
      {/* Month selector */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 p-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
          <span className="font-bold text-gray-700 text-sm w-32 text-center">{ID_MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={18} /></button>
        </div>
        <div className="text-sm text-gray-500">
          {rows.length} absensi · Total denda: <span className="font-bold text-red-600">Rp {totalDenda.toLocaleString("id-ID")}</span>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-3 py-2 font-semibold">Foto</th>
              <th className="px-3 py-2 font-semibold">Tanggal</th>
              <th className="px-3 py-2 font-semibold">Karyawan</th>
              <th className="px-3 py-2 font-semibold">Masuk</th>
              <th className="px-3 py-2 font-semibold">Keluar</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold text-right">Denda</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Belum ada absensi bulan ini</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-1.5">
                  {r.foto_checkin_url ? (
                    <button onClick={() => setFotoModal(r)} className="block w-12 h-12 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-amber-400">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.foto_checkin_url} alt="foto" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <span className="text-gray-300 text-xs">Tidak ada</span>
                  )}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{formatTglID(r.tanggal)}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">{namaOf(r.karyawan_id)}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-600">{jamWIB(r.jam_checkin)}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-600">{jamWIB(r.jam_checkout)}</td>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                  {STATUS_LABEL[r.status_kehadiran] ?? r.status_kehadiran}
                  {r.menit_telat > 0 && <span className="text-red-500 text-xs"> · telat {r.menit_telat}m</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {r.denda > 0 ? (
                    r.denda_dihapus_ampun
                      ? <span className="text-green-600 text-xs">Rp {r.denda.toLocaleString("id-ID")} (ampun)</span>
                      : <span className="text-red-600 font-semibold">Rp {r.denda.toLocaleString("id-ID")}</span>
                  ) : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal foto full */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setFotoModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-800">{namaOf(fotoModal.karyawan_id)}</p>
                <p className="text-xs text-gray-500">{formatTglID(fotoModal.tanggal)} · Check-in {jamWIB(fotoModal.jam_checkin)}</p>
              </div>
              <button onClick={() => setFotoModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {fotoModal.foto_checkin_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoModal.foto_checkin_url} alt="foto check-in" className="w-full object-contain max-h-[60vh] bg-gray-900" />
            )}
            <div className="p-4">
              {fotoModal.lat_checkin != null && fotoModal.lng_checkin != null ? (
                <a href={`https://maps.google.com/?q=${fotoModal.lat_checkin},${fotoModal.lng_checkin}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-50 text-blue-600 font-semibold text-sm hover:bg-blue-100">
                  <MapPin size={16} /> Lihat Lokasi Check-in di Google Maps
                </a>
              ) : (
                <p className="text-center text-xs text-gray-400">Lokasi check-in tidak tercatat</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Pengajuan Izin (Super Admin review + veto) ──
interface IzinRow {
  id: string; karyawan_id: string; tanggal_izin: string; jenis: string;
  foto_bukti_url: string | null; foto_surat_url: string | null;
  status: string; status_surat: string | null; batas_upload_surat: string | null;
  override_by: string | null;
  dibatalkan_oleh: string | null; catatan_pembatalan: string | null; created_at: string;
  karyawan: { nama: string } | null;
}
function PengajuanIzin({ userName }: { userName: string }) {
  const [rows, setRows] = useState<IzinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    // 1) Deadline surat 20:00: sakit menunggu_surat yg lewat batas → surat_telat + alpha
    const nowIso = new Date().toISOString();
    const { data: telat } = await supabase.from("pengajuan_izin")
      .select("id, karyawan_id, tanggal_izin")
      .eq("jenis", "izin_sakit").eq("status", "aktif").eq("status_surat", "menunggu_surat")
      .lt("batas_upload_surat", nowIso);
    for (const t of ((telat as { id: string; karyawan_id: string; tanggal_izin: string }[] | null) ?? [])) {
      await supabase.from("pengajuan_izin").update({ status_surat: "surat_telat" }).eq("id", t.id);
      await supabase.from("absensi").upsert({
        karyawan_id: t.karyawan_id, tanggal: t.tanggal_izin,
        status_kehadiran: "alpha", denda: DENDA.ALPHA,
      }, { onConflict: "karyawan_id,tanggal" });
    }
    // 2) Fetch lengkap
    const { data } = await supabase.from("pengajuan_izin")
      .select("id, karyawan_id, tanggal_izin, jenis, foto_bukti_url, foto_surat_url, status, status_surat, batas_upload_surat, override_by, dibatalkan_oleh, catatan_pembatalan, created_at, karyawan:karyawan_id(nama)")
      .order("tanggal_izin", { ascending: false }).limit(200);
    setRows((data as unknown as IzinRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const jenisLabel = (j: string) => j === "izin_sakit" ? "Izin Sakit" : "Izin Biasa";
  const suratBadge = (r: IzinRow): { text: string; cls: string } | null => {
    if (r.jenis !== "izin_sakit") return null;
    if (r.status_surat === "surat_masuk") return { text: "Surat masuk", cls: "bg-green-100 text-green-700" };
    if (r.status_surat === "surat_telat") return { text: "Surat telat → Alpha", cls: "bg-red-100 text-red-600" };
    return { text: "Menunggu surat", cls: "bg-amber-100 text-amber-700" };
  };

  async function tandaiTidakSah(r: IzinRow) {
    const apa = r.jenis === "izin_sakit" ? "surat" : "bukti izin";
    const catatan = prompt(`Tandai ${apa} ini tidak sah? Status karyawan akan menjadi Alpha dengan denda Rp 50.000.\n\n${r.karyawan?.nama} · ${hariTglID(r.tanggal_izin)}\n\nCatatan (opsional):`, "");
    if (catatan === null) return;
    setBusyId(r.id);
    await supabase.from("pengajuan_izin").update({
      status: "dibatalkan", dibatalkan_oleh: userName,
      dibatalkan_at: new Date().toISOString(), catatan_pembatalan: catatan || null,
    }).eq("id", r.id);
    await supabase.from("absensi").upsert({
      karyawan_id: r.karyawan_id, tanggal: r.tanggal_izin,
      status_kehadiran: "alpha", denda: DENDA.ALPHA, is_override: true,
      override_by: userName, override_at: new Date().toISOString(),
    }, { onConflict: "karyawan_id,tanggal" });
    setBusyId(null);
    fetchRows();
  }

  // Override: surat telat tapi alasan wajar → tetapkan sebagai sakit, denda 0
  async function overrideSakit(r: IzinRow) {
    const catatan = prompt(`Tetapkan sebagai Sakit (override)?\nStatus kembali ke Izin Sakit, denda Rp 0.\n\n${r.karyawan?.nama} · ${hariTglID(r.tanggal_izin)}\n\nCatatan (opsional):`, "");
    if (catatan === null) return;
    setBusyId(r.id);
    await supabase.from("pengajuan_izin").update({
      status_surat: "surat_masuk", override_by: userName,
      override_at: new Date().toISOString(), catatan_override: catatan || null,
    }).eq("id", r.id);
    await supabase.from("absensi").upsert({
      karyawan_id: r.karyawan_id, tanggal: r.tanggal_izin,
      status_kehadiran: "izin_sakit", denda: 0, is_override: true,
      override_by: userName, override_at: new Date().toISOString(),
    }, { onConflict: "karyawan_id,tanggal" });
    setBusyId(null);
    fetchRows();
  }

  const aktif = rows.filter((r) => r.status === "aktif");
  const lain  = rows.filter((r) => r.status !== "aktif");

  const Card = ({ r }: { r: IzinRow }) => {
    const fotoUrl = r.jenis === "izin_sakit" ? r.foto_surat_url : r.foto_bukti_url;
    const badge = suratBadge(r);
    const isTelat = r.jenis === "izin_sakit" && r.status_surat === "surat_telat";
    return (
      <div className={`rounded-xl border p-3 ${r.status === "aktif" ? (r.jenis === "izin_sakit" ? "border-teal-100 bg-teal-50/40" : "border-sky-100 bg-sky-50/40") : "border-gray-100 bg-gray-50/60"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {fotoUrl ? (
              <button onClick={() => setFotoModal(fotoUrl)} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-teal-400 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoUrl} alt="bukti" className="w-full h-full object-cover" />
              </button>
            ) : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-[10px] text-center shrink-0">belum ada</div>}
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-800">{r.karyawan?.nama ?? "—"}</p>
              <p className="text-xs text-gray-500">{hariTglID(r.tanggal_izin)} · {jenisLabel(r.jenis)}</p>
              {badge && <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
              {r.override_by && <p className="text-[11px] text-green-600 mt-0.5">Override sakit oleh {r.override_by}</p>}
              {r.status === "dibatalkan" && (
                <p className="text-[11px] text-red-500 mt-0.5">Tidak sah · {r.dibatalkan_oleh ?? "—"}{r.catatan_pembatalan ? ` · "${r.catatan_pembatalan}"` : ""}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {r.status === "aktif" ? (
              <>
                <button onClick={() => tandaiTidakSah(r)} disabled={busyId === r.id}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors disabled:opacity-40">
                  {r.jenis === "izin_sakit" ? "Tandai Surat Tidak Sah = Alpha" : "Tandai Bukti Tidak Sah = Alpha"}
                </button>
                {isTelat && (
                  <button onClick={() => overrideSakit(r)} disabled={busyId === r.id}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 transition-colors disabled:opacity-40">
                    Tetapkan sebagai Sakit (override)
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Tidak sah</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-gray-400">Memuat…</p>}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-sky-500" />
          <h2 className="font-semibold text-gray-700 text-sm">Izin Aktif ({aktif.length})</h2>
        </div>
        {aktif.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">Tidak ada izin aktif</p>
          : aktif.map((r) => <Card key={r.id} r={r} />)}
      </div>

      {lain.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Riwayat Tidak Sah ({lain.length})</h2>
          {lain.map((r) => <Card key={r.id} r={r} />)}
        </div>
      )}

      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setFotoModal(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoModal} alt="bukti izin" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
