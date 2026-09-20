import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { ChevronLeft, ChevronRight, ChevronDown, Copy, Check, Trash2 } from "lucide-react";

interface Karyawan { id: string; nama: string; status: string }
interface ShiftMaster { id: string; nama_shift: string; jam_masuk: string }
interface RosterRow { id: string; tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null }

interface BarisHari {
  roster_id: string; karyawan_id: string; shift_id: string; tugas_datang: string; tugas_pulang: string;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// 13 slot kerja tetap (shift + pasangan Job Desc Datang/Pulang) — urutan &
// isinya sesuai roster spreadsheet yang sudah berjalan. Slot-nya TETAP
// tiap hari/minggu, yang rolling cuma NAMA yang menempati tiap slot.
// Dipakai buat auto-isi begitu baris baru ditambahkan, supaya admin cuma
// perlu pilih nama — shift & job desc-nya sudah otomatis ada (tetap bisa
// diubah manual lewat dropdown kalau memang ada perubahan).
interface SlotTemplate { jam: string; datang: string; pulang: string }
const TEMPLATE_SLOT: SlotTemplate[] = [
  { jam: "06:00", datang: "Cuci + Lap Meja Ngadon", pulang: "Prepare Bahan Ngadon" },
  { jam: "06:00", datang: "Lap Tampah", pulang: "Cuci Mesin + Cuci Meja Ngadon + Sapu Area Ngadon" },
  { jam: "08:00", datang: "Cuci Meja Bikin", pulang: "Isi Box Mentega" },
  { jam: "08:00", datang: "Lap Tampah", pulang: "Cuci Meja Bikin + Rapihkan Rak & Ember Minyak" },
  { jam: "08:00", datang: "Parut Keju", pulang: "Cuci Peralatan + Cuci Sink + Isi Air Sabun" },
  { jam: "08:00", datang: "Lap Tampah", pulang: "Cuci Tampah + Ganti Kardus Bawah Sink" },
  { jam: "08:00", datang: "Timbang Bahan", pulang: "Isi Box Mentega" },
  { jam: "08:00", datang: "Lap Tampah", pulang: "Cuci Lap + Cuci Ember Bekas Limbah" },
  { jam: "08:00", datang: "Sapu + Pel Area Bikin + Sampah", pulang: "Isi Box Mentega" },
  { jam: "10:00", datang: "Lap Alat Tekan", pulang: "Lap Alat Tekan + Lap Kaca" },
  { jam: "10:00", datang: "Cuci Kompor + Cuci Meja", pulang: "Cuci Kompor + Cuci Meja + Lap Alat Tekan" },
  { jam: "13:00", datang: "Lap Meja Packing", pulang: "Nyapu + Lap Rak + Lap Freezer" },
  { jam: "13:00", datang: "Cuci + Lap Meja Packing", pulang: "Ngepel + Lap Vacuum + Cuci Meja + Sampah" },
];
const TUGAS_AWAL: string[] = Array.from(new Set(TEMPLATE_SLOT.flatMap((s) => [s.datang, s.pulang])));
const OPSI_BARU = "__baru__";
const BELUM_PILIH = "__belum_pilih__";

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

export default function RosterTab() {
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
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [shiftList, setShiftList] = useState<ShiftMaster[]>([]);
  // Edit lokal ke slot yang BELUM ada namanya (shift/job desc diubah dari
  // dropdown sebelum nama dipilih) — belum ada baris di DB buat slot ini,
  // jadi disimpan di sini dulu, baru dipakai begitu nama akhirnya dipilih.
  const [slotOverride, setSlotOverride] = useState<Record<string, { shift_id?: string; datang?: string; pulang?: string }>>({});

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muatMinggu = useCallback(async () => {
    setLoading(true);
    const [rhRes, histRes, kRes, sRes] = await Promise.all([
      supabase.from("audit_kebersihan_roster_harian")
        .select("id, tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang")
        .gte("tanggal", hariList[0]).lte("tanggal", hariList[6]).eq("is_aktif", true),
      supabase.from("audit_kebersihan_roster_harian").select("nama_tugas, nama_tugas_datang").limit(2000),
      supabase.from("karyawan").select("id, nama, status").eq("status", "aktif").order("nama"),
      supabase.from("shift_master").select("id, nama_shift, jam_masuk").order("jam_masuk"),
    ]);
    const rhRows = (rhRes.data as RosterRow[] | null) ?? [];
    const histRows = (histRes.data as { nama_tugas: string; nama_tugas_datang: string | null }[] | null) ?? [];
    setKaryawanList((kRes.data as Karyawan[] | null) ?? []);
    setShiftList((sRes.data as ShiftMaster[] | null) ?? []);

    const histSet = new Set<string>(TUGAS_AWAL);
    histRows.forEach((r) => { if (r.nama_tugas) histSet.add(r.nama_tugas); if (r.nama_tugas_datang) histSet.add(r.nama_tugas_datang); });
    setDaftarTugas(Array.from(histSet).sort((a, b) => a.localeCompare(b)));

    const byHari: Record<string, BarisHari[]> = {};
    hariList.forEach((tgl) => {
      byHari[tgl] = rhRows.filter((r) => r.tanggal === tgl).map((r) => ({
        roster_id: r.id, karyawan_id: r.karyawan_id, shift_id: r.shift_id ?? "",
        tugas_datang: r.nama_tugas_datang ?? "", tugas_pulang: r.nama_tugas,
      }));
    });
    setDataHari(byHari);
    setLoading(false);
  }, [hariList]);

  useEffect(() => { muatMinggu(); }, [muatMinggu]);

  const namaKaryawan = useCallback((id: string) => karyawanList.find((k) => k.id === id)?.nama ?? "-", [karyawanList]);

  async function simpanBaris(tgl: string, baris: BarisHari, patch: Partial<BarisHari>) {
    const key = `${tgl}|${baris.karyawan_id}`;
    setSavingKey(key); setErr("");
    const updated: BarisHari = { ...baris, ...patch };
    setDataHari((d) => ({ ...d, [tgl]: d[tgl].map((b) => b.roster_id === baris.roster_id ? updated : b) }));

    const { error } = await supabase.from("audit_kebersihan_roster_harian").update({
      shift_id: updated.shift_id || null,
      nama_tugas_datang: updated.tugas_datang.trim() || null, nama_tugas: updated.tugas_pulang.trim(),
    }).eq("id", baris.roster_id);

    setSavingKey(null);
    if (error) { setErr(error.message); return; }
    const nilaiTugas = patch.tugas_datang ?? patch.tugas_pulang;
    if (nilaiTugas && nilaiTugas.trim() && !daftarTugas.includes(nilaiTugas.trim())) {
      setDaftarTugas((prev) => Array.from(new Set([...prev, nilaiTugas.trim()])).sort((a, b) => a.localeCompare(b)));
    }
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  }

  function pilihAtauBaru(tgl: string, baris: BarisHari, field: "tugas_datang" | "tugas_pulang", value: string) {
    if (value === OPSI_BARU) {
      const teks = prompt("Tulis tugas baru:");
      if (teks && teks.trim()) simpanBaris(tgl, baris, { [field]: teks.trim() });
      return;
    }
    simpanBaris(tgl, baris, { [field]: value });
  }

// Slot kosong (blm ada nama) dari TEMPLATE_SLOT — dipakai buat pad baris
// bawaan tiap hari sampai 13 baris, biar Shift & Job Desc SELALU kelihatan
// dari awal tanpa perlu pilih nama dulu (SPV/admin tinggal pilih nama
// lewat dropdown kapan saja siap).
  function shiftIdUntukJam(jam: string): string {
    return shiftList.find((s) => s.jam_masuk.slice(0, 5) === jam)?.id ?? "";
  }

  // Ubah shift/job desc slot yang BELUM ada namanya — cuma disimpan lokal,
  // baru ditulis ke DB begitu nama dipilih (lewat pilihNamaSlot).
  function ubahSlotOverride(tgl: string, slotIndex: number, patch: { shift_id?: string; datang?: string; pulang?: string }) {
    const key = `${tgl}|${slotIndex}`;
    setSlotOverride((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // Isi nama di slot kosong (index = urutan slot template ke berapa) →
  // insert baris baru ke DB dengan shift & job desc dari slot itu (atau
  // dari override kalau admin sempat mengubahnya sebelum pilih nama).
  async function pilihNamaSlot(tgl: string, slotIndex: number, karyawanId: string) {
    if (!karyawanId) return;
    const key = `${tgl}|slot${slotIndex}`;
    setSavingKey(key); setErr("");
    const slot = TEMPLATE_SLOT[slotIndex] ?? { jam: shiftList[0]?.jam_masuk.slice(0, 5) ?? "06:00", datang: "", pulang: "" };
    const override = slotOverride[`${tgl}|${slotIndex}`] ?? {};
    const shiftId = override.shift_id || shiftIdUntukJam(slot.jam) || shiftList[0]?.id || null;
    const datang = override.datang ?? slot.datang;
    const pulang = override.pulang ?? slot.pulang;
    const { data, error } = await supabase.from("audit_kebersihan_roster_harian").upsert({
      tanggal: tgl, karyawan_id: karyawanId, shift_id: shiftId,
      nama_tugas_datang: datang, nama_tugas: pulang,
      created_by: user?.nama ?? null, is_aktif: true,
    }, { onConflict: "tanggal,karyawan_id" }).select("id").single();
    setSavingKey(null);
    if (error) { setErr(error.message); return; }
    const newId = (data as { id: string }).id;
    setDataHari((d) => ({
      ...d,
      [tgl]: [...(d[tgl] ?? []), { roster_id: newId, karyawan_id: karyawanId, shift_id: shiftId ?? "", tugas_datang: datang, tugas_pulang: pulang }],
    }));
    setSlotOverride((prev) => { const n = { ...prev }; delete n[`${tgl}|${slotIndex}`]; return n; });
  }

  // Tambahan di luar 13 slot baku (jarang perlu) — mulai kosong (bukan
  // ikut salah satu dari 13 slot template), tinggal diisi manual lewat
  // dropdown Shift/Job Desc begitu baris muncul.
  async function tambahKaryawanBebas(tgl: string, karyawanId: string) {
    if (!karyawanId) return;
    const key = `${tgl}|bebas`;
    setSavingKey(key); setErr("");
    const shiftId = shiftList[0]?.id ?? null;
    const { data, error } = await supabase.from("audit_kebersihan_roster_harian").upsert({
      tanggal: tgl, karyawan_id: karyawanId, shift_id: shiftId,
      nama_tugas_datang: null, nama_tugas: "",
      created_by: user?.nama ?? null, is_aktif: true,
    }, { onConflict: "tanggal,karyawan_id" }).select("id").single();
    setSavingKey(null);
    if (error) { setErr(error.message); return; }
    const newId = (data as { id: string }).id;
    setDataHari((d) => ({
      ...d,
      [tgl]: [...(d[tgl] ?? []), { roster_id: newId, karyawan_id: karyawanId, shift_id: shiftId ?? "", tugas_datang: "", tugas_pulang: "" }],
    }));
  }

  // Tukar nama di baris yang sudah ada (shift & job desc slot itu tidak
  // berubah) — dipakai buat rolling mingguan: tinggal ganti siapa yang
  // menempati tiap slot, tanpa hapus-tambah baris.
  async function gantiNama(tgl: string, baris: BarisHari, karyawanIdBaru: string) {
    if (!karyawanIdBaru || karyawanIdBaru === baris.karyawan_id) return;
    if ((dataHari[tgl] ?? []).some((b) => b.karyawan_id === karyawanIdBaru)) {
      setErr(`${namaKaryawan(karyawanIdBaru)} sudah ada di roster ${labelTglPendek(tgl)} hari ini.`);
      return;
    }
    const key = `${tgl}|${baris.karyawan_id}`;
    setSavingKey(key); setErr("");
    const { error } = await supabase.from("audit_kebersihan_roster_harian")
      .update({ karyawan_id: karyawanIdBaru }).eq("id", baris.roster_id);
    setSavingKey(null);
    if (error) { setErr(error.message); return; }
    setDataHari((d) => ({ ...d, [tgl]: d[tgl].map((b) => b.roster_id === baris.roster_id ? { ...b, karyawan_id: karyawanIdBaru } : b) }));
  }

  async function hapusBaris(tgl: string, baris: BarisHari) {
    if (!confirm(`Hapus ${namaKaryawan(baris.karyawan_id)} dari roster ${labelTglPendek(tgl)}?`)) return;
    await supabase.from("audit_kebersihan_roster_harian").delete().eq("id", baris.roster_id);
    setDataHari((d) => ({ ...d, [tgl]: d[tgl].filter((b) => b.roster_id !== baris.roster_id) }));
  }

  async function salinDariMingguLalu() {
    const totalIsi = Object.values(dataHari).reduce((n, rows) => n + rows.length, 0);
    if (totalIsi > 0 && !confirm("Minggu ini sudah ada isian. Tetap salin dari minggu lalu? (baris yang sudah ada tidak akan ditimpa)")) return;
    setErr("");
    const seninLalu = addDaysStr(seninAwal, -7);
    const { data: lama } = await supabase.from("audit_kebersihan_roster_harian")
      .select("tanggal, karyawan_id, shift_id, nama_tugas, nama_tugas_datang")
      .gte("tanggal", seninLalu).lte("tanggal", addDaysStr(seninLalu, 6)).eq("is_aktif", true);
    const lamaRows = (lama as { tanggal: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; nama_tugas_datang: string | null }[] | null) ?? [];
    if (lamaRows.length === 0) { setErr("Minggu lalu tidak ada data untuk disalin."); return; }
    const existing = new Set<string>();
    Object.entries(dataHari).forEach(([tgl, rows]) => rows.forEach((r) => existing.add(`${tgl}|${r.karyawan_id}`)));
    const baru = lamaRows
      .map((r) => ({ ...r, tanggal: addDaysStr(r.tanggal, 7) }))
      .filter((r) => !existing.has(`${r.tanggal}|${r.karyawan_id}`))
      .map((r) => ({ ...r, created_by: user?.nama ?? null, is_aktif: true }));
    if (baru.length > 0) await supabase.from("audit_kebersihan_roster_harian").upsert(baru, { onConflict: "tanggal,karyawan_id" });
    muatMinggu();
  }

  return (
    <div className="space-y-4 pb-24">
      <p className="text-sm text-gray-500">
        13 baris (Shift + pasangan Job Desc Datang/Pulang) sudah <b>otomatis ada</b> dari awal setiap hari — tidak perlu diisi manual,
        tapi tetap bisa diubah lewat dropdown kalau jumlah orang di suatu shift bertambah/berkurang. Tinggal pilih <b>Nama</b> di tiap
        baris kapan pun siap — begitu shift-nya diubah, baris otomatis pindah ke kelompok shift itu. Minggu depan tinggal
        &quot;Salin dari minggu lalu&quot; lalu tukar-tukar dropdown Nama saja sesuai rolling shift. Kalau di hari-H ternyata
        karyawannya izin/sakit/alpha, baris itu <b>otomatis dilewati</b> saat SPV audit.
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
            const rowsAsli = dataHari[tgl] ?? [];
            // Urutkan sesuai urutan shift (06:00 dulu, dst) biar sejajar visual sama urutan TEMPLATE_SLOT.
            const rows = [...rowsAsli].sort((a, b) => {
              const ja = shiftList.find((s) => s.id === a.shift_id)?.jam_masuk ?? "";
              const jb = shiftList.find((s) => s.id === b.shift_id)?.jam_masuk ?? "";
              return ja.localeCompare(jb);
            });
            const namaTerpakai = new Set(rows.map((r) => r.karyawan_id));
            const karyawanTersedia = karyawanList.filter((k) => !namaTerpakai.has(k.id));
            const jumlahTerisi = rows.filter((r) => r.karyawan_id).length;
            const slotKosong = Math.max(0, TEMPLATE_SLOT.length - rows.length);
            const buka = expanded === tgl;
            return (
              <div key={tgl} className="card overflow-hidden !p-0">
                <button onClick={() => setExpanded(buka ? null : tgl)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${buka ? "rotate-180" : ""}`} />
                    <span className="font-semibold text-sm text-gray-700">{HARI[dow]}, {labelTglPendek(tgl)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{jumlahTerisi}/{TEMPLATE_SLOT.length} nama diisi</span>
                </button>

                {buka && (
                  <div className="px-4 pb-4">
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm min-w-[620px]">
                        <thead>
                          <tr className="text-left text-[11px] text-gray-400 uppercase">
                            <th className="font-semibold pb-1.5 pr-2">Nama</th>
                            <th className="font-semibold pb-1.5 pr-2">Shift</th>
                            <th className="font-semibold pb-1.5 pr-2">Job Desc Datang</th>
                            <th className="font-semibold pb-1.5 pr-2">Job Desc Pulang</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const key = `${tgl}|${r.karyawan_id}`;
                            const opsiNama = karyawanTersedia.concat(karyawanList.filter((k) => k.id === r.karyawan_id));
                            return (
                              <tr key={r.roster_id} className="border-t border-gray-50">
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5" value={r.karyawan_id}
                                    onChange={(e) => gantiNama(tgl, r, e.target.value)}>
                                    {opsiNama.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5 w-24" value={r.shift_id}
                                    onChange={(e) => simpanBaris(tgl, r, { shift_id: e.target.value })}>
                                    {shiftList.map((s) => <option key={s.id} value={s.id}>{s.jam_masuk.slice(0, 5)}</option>)}
                                  </select>
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
                                  {savedKey === key && <Check size={13} className="text-green-500 inline" />}
                                  <button onClick={() => hapusBaris(tgl, r)} className="ml-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                                </td>
                              </tr>
                            );
                          })}
                          {Array.from({ length: slotKosong }, (_, i) => {
                            const slotIndex = rows.length + i;
                            const slot = TEMPLATE_SLOT[slotIndex] ?? TEMPLATE_SLOT[0];
                            const key = `${tgl}|slot${slotIndex}`;
                            const ov = slotOverride[`${tgl}|${slotIndex}`] ?? {};
                            const shiftIdTampil = ov.shift_id ?? shiftIdUntukJam(slot.jam);
                            const datangTampil = ov.datang ?? slot.datang;
                            const pulangTampil = ov.pulang ?? slot.pulang;
                            return (
                              <tr key={`slot-${slotIndex}`} className="border-t border-gray-50">
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5" value={BELUM_PILIH}
                                    onChange={(e) => { if (e.target.value !== BELUM_PILIH) pilihNamaSlot(tgl, slotIndex, e.target.value); }}>
                                    <option value={BELUM_PILIH}>Pilih nama…</option>
                                    {karyawanTersedia.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5 w-24" value={shiftIdTampil}
                                    onChange={(e) => ubahSlotOverride(tgl, slotIndex, { shift_id: e.target.value })}>
                                    {shiftList.map((s) => <option key={s.id} value={s.id}>{s.jam_masuk.slice(0, 5)}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5" value={datangTampil}
                                    onChange={(e) => {
                                      if (e.target.value === OPSI_BARU) {
                                        const teks = prompt("Tulis tugas baru:");
                                        if (teks && teks.trim()) ubahSlotOverride(tgl, slotIndex, { datang: teks.trim() });
                                        return;
                                      }
                                      ubahSlotOverride(tgl, slotIndex, { datang: e.target.value });
                                    }}>
                                    <option value="">—</option>
                                    {datangTampil && !daftarTugas.includes(datangTampil) && <option value={datangTampil}>{datangTampil}</option>}
                                    {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                                    <option value={OPSI_BARU}>+ Tugas baru…</option>
                                  </select>
                                </td>
                                <td className="py-1.5 pr-2 align-top">
                                  <select className="input text-xs py-1.5" value={pulangTampil}
                                    onChange={(e) => {
                                      if (e.target.value === OPSI_BARU) {
                                        const teks = prompt("Tulis tugas baru:");
                                        if (teks && teks.trim()) ubahSlotOverride(tgl, slotIndex, { pulang: teks.trim() });
                                        return;
                                      }
                                      ubahSlotOverride(tgl, slotIndex, { pulang: e.target.value });
                                    }}>
                                    <option value="">Pilih…</option>
                                    {pulangTampil && !daftarTugas.includes(pulangTampil) && <option value={pulangTampil}>{pulangTampil}</option>}
                                    {daftarTugas.map((t) => <option key={t} value={t}>{t}</option>)}
                                    <option value={OPSI_BARU}>+ Tugas baru…</option>
                                  </select>
                                </td>
                                <td className="py-1.5 align-top text-center">
                                  {savingKey === key && <span className="text-[10px] text-gray-400">…</span>}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-t border-gray-50">
                            <td colSpan={5} className="py-2">
                              <select className="input text-xs py-1.5 w-full max-w-xs" value={BELUM_PILIH}
                                onChange={(e) => { if (e.target.value !== BELUM_PILIH) tambahKaryawanBebas(tgl, e.target.value); }}>
                                <option value={BELUM_PILIH}>+ Tambah karyawan (di luar 13 baku)…</option>
                                {karyawanTersedia.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                              </select>
                            </td>
                          </tr>
                        </tbody>
                      </table>
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
