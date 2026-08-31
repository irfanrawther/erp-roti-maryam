"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { kompresGambar } from "@/lib/gambar";
import {
  ambilPelanggaranUmum, ambilTier4, TIER_LABEL, TIER_ORDER, TIER_BADGE,
  labelStatus, badgeStatus, hitungResponDeadline,
  type MasterPelanggaranRow, type StatusLaporan,
} from "@/lib/pelanggaranAlur";
import {
  ShieldAlert, AlertTriangle, Search, ChevronLeft, Camera, X,
  Check, User, Users,
} from "lucide-react";

interface Karyawan { id: string; nama: string; jabatan: string | null; kategori_dokumen: string | null }
interface Laporan {
  id: string; tanggal_kejadian: string; jam_kejadian: string | null; status: StatusLaporan; created_at: string;
  karyawan: { nama: string } | null; master_pelanggaran: { nama_pelanggaran: string; poin: number } | null;
}
interface LaporanInsiden {
  id: string; tanggal_kejadian: string; jenis_insiden: string; status: string; created_at: string;
  karyawan: { nama: string } | null;
}

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function jalurDariKategori(k: string | null): "training" | "staff" | null {
  if (!k) return null;
  if (k.startsWith("training")) return "training";
  if (k.startsWith("staff")) return "staff";
  return null;
}

export default function LaporPelanggaranPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"lapor" | "insiden">("lapor");
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [riwayat, setRiwayat] = useState<Laporan[]>([]);
  const [riwayatInsiden, setRiwayatInsiden] = useState<LaporanInsiden[]>([]);

  // ── Alur "Lapor Pelanggaran" ──
  const [langkah, setLangkah] = useState<"jalur" | "pilih" | "form">("jalur");
  const [jalur, setJalur] = useState<"training" | "staff" | null>(null);
  const [master, setMaster] = useState<MasterPelanggaranRow[]>([]);
  const [cari, setCari] = useState("");
  const [pel, setPel] = useState<MasterPelanggaranRow | null>(null);

  const [kId, setKId] = useState("");
  const [cariKaryawan, setCariKaryawan] = useState("");
  const [tgl, setTgl] = useState(todayWIB());
  const [jam, setJam] = useState("");
  const [catatan, setCatatan] = useState("");
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [saksiMode, setSaksiMode] = useState<"none" | "karyawan" | "manual">("none");
  const [saksiKId, setSaksiKId] = useState("");
  const [saksiManual, setSaksiManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  // ── Insiden Berat (Tier 4) ──
  const [tier4, setTier4] = useState<MasterPelanggaranRow[]>([]);
  const [iKid, setIKid] = useState("");
  const [iPelId, setIPelId] = useState("");
  const [iTgl, setITgl] = useState(todayWIB());
  const [iKet, setIKet] = useState("");
  const [iFotoFiles, setIFotoFiles] = useState<File[]>([]);
  const [iBusy, setIBusy] = useState(false);
  const [iMsg, setIMsg] = useState(""); const [iErr, setIErr] = useState("");

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).laporPelanggaran) { router.replace(homeRoute(u)); return; }
    fetchAll(u);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async (u: UserSession) => {
    const [kRes, t4] = await Promise.all([
      supabase.from("karyawan").select("id, nama, jabatan, kategori_dokumen").eq("status", "aktif").order("nama"),
      ambilTier4(),
    ]);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setTier4(t4);
    fetchRiwayat(u);
  }, []);

  async function fetchRiwayat(u: UserSession) {
    const [lRes, iRes] = await Promise.all([
      supabase.from("laporan_pelanggaran")
        .select("id, tanggal_kejadian, jam_kejadian, status, created_at, karyawan:karyawan_id(nama), master_pelanggaran:pelanggaran_id(nama_pelanggaran, poin)")
        .eq("dilaporkan_oleh", u.nama).order("created_at", { ascending: false }).limit(50),
      supabase.from("laporan_insiden_berat")
        .select("id, tanggal_kejadian, jenis_insiden, status, created_at, karyawan:karyawan_id(nama)")
        .eq("dilaporkan_oleh", u.nama).order("created_at", { ascending: false }).limit(20),
    ]);
    setRiwayat((lRes.data as unknown as Laporan[]) ?? []);
    setRiwayatInsiden((iRes.data as unknown as LaporanInsiden[]) ?? []);
  }

  async function pilihJalur(j: "training" | "staff") {
    setJalur(j); setLangkah("pilih"); setCari(""); setPel(null);
    setMaster(await ambilPelanggaranUmum(j));
  }

  function pilihPelanggaran(m: MasterPelanggaranRow) {
    setPel(m); setLangkah("form");
    setKId(""); setCariKaryawan(""); setTgl(todayWIB()); setJam(""); setCatatan("");
    setFotoFiles([]); setSaksiMode("none"); setSaksiKId(""); setSaksiManual("");
    setErr(""); setMsg("");
  }

  const karyawanJalur = useMemo(
    () => karyawan.filter((k) => jalurDariKategori(k.kategori_dokumen) === jalur),
    [karyawan, jalur]
  );
  const karyawanHasil = useMemo(
    () => karyawanJalur.filter((k) => k.nama.toLowerCase().includes(cariKaryawan.toLowerCase())),
    [karyawanJalur, cariKaryawan]
  );
  const masterHasil = useMemo(
    () => master.filter((m) => m.nama_pelanggaran.toLowerCase().includes(cari.toLowerCase())),
    [master, cari]
  );

  async function uploadFotoMulti(files: File[], folder: string): Promise<string[]> {
    const urls: string[] = [];
    for (const f of files) {
      const blob = await kompresGambar(f);
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      urls.push(supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  async function submitLapor() {
    if (!user || !pel || !kId) { setErr("Pilih karyawan dulu."); return; }
    setErr(""); setMsg(""); setBusy(true);
    try {
      const fotoUrls = fotoFiles.length ? await uploadFotoMulti(fotoFiles, "pelanggaran") : [];
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("laporan_pelanggaran").insert({
        karyawan_id: kId, pelanggaran_id: pel.id, tanggal_kejadian: tgl, jam_kejadian: jam || null,
        jalur, dilaporkan_oleh: user.nama, keterangan: catatan.trim() || null,
        foto_bukti_urls: fotoUrls.length ? fotoUrls : null,
        saksi_karyawan_id: saksiMode === "karyawan" && saksiKId ? saksiKId : null,
        saksi_manual: saksiMode === "manual" && saksiManual.trim() ? saksiManual.trim() : null,
        status: "pending", respon_deadline: hitungResponDeadline(nowIso),
      });
      if (error) throw new Error(error.message);
      setMsg("Laporan terkirim — menunggu keputusan Manajer Operasional.");
      setLangkah("jalur"); setJalur(null); setPel(null);
      fetchRiwayat(user);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal mengirim"); }
    finally { setBusy(false); }
  }

  async function submitInsiden() {
    if (!user || !iKid || !iPelId) { setIErr("Karyawan & jenis insiden wajib diisi"); return; }
    setIErr(""); setIMsg(""); setIBusy(true);
    try {
      const fotoUrls = iFotoFiles.length ? await uploadFotoMulti(iFotoFiles, "insiden") : [];
      const jenis = tier4.find((t) => t.id === iPelId)?.nama_pelanggaran ?? "";
      const { error } = await supabase.from("laporan_insiden_berat").insert({
        karyawan_id: iKid, pelanggaran_id: iPelId, jenis_insiden: jenis, tanggal_kejadian: iTgl,
        dilaporkan_oleh: user.nama, keterangan: iKet.trim() || null,
        foto_bukti_urls: fotoUrls.length ? fotoUrls : null, status: "pending",
      });
      if (error) throw new Error(error.message);
      setIMsg("Laporan insiden terkirim langsung ke Manajer Operasional.");
      setIKid(""); setIPelId(""); setIKet(""); setIFotoFiles([]);
      fetchRiwayat(user);
    } catch (e) { setIErr(e instanceof Error ? e.message : "Gagal mengirim"); }
    finally { setIBusy(false); }
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} className="text-red-500" />
        <h1 className="text-xl font-bold text-gray-800">Lapor Pelanggaran</h1>
      </div>

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {([["lapor", "Lapor Pelanggaran"], ["insiden", "Insiden Berat"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>

      {/* ══════════ TAB LAPOR PELANGGARAN ══════════ */}
      {tab === "lapor" && (
        <>
          <div className="card space-y-3">
            {/* Langkah 1: pilih jalur */}
            {langkah === "jalur" && (
              <>
                <p className="text-sm font-semibold text-gray-600">Karyawan yang dilaporkan jalur apa?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => pilihJalur("training")}
                    className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-gray-100 hover:border-red-300 hover:bg-red-50/40 transition-colors">
                    <User size={26} className="text-gray-400" />
                    <span className="font-semibold text-gray-700">Training</span>
                  </button>
                  <button onClick={() => pilihJalur("staff")}
                    className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-gray-100 hover:border-red-300 hover:bg-red-50/40 transition-colors">
                    <Users size={26} className="text-gray-400" />
                    <span className="font-semibold text-gray-700">Staff</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 text-center">
                  Kamu bisa melaporkan karyawan shift mana pun, tidak dibatasi shift kamu sendiri.
                </p>
              </>
            )}

            {/* Langkah 2: pilih jenis pelanggaran */}
            {langkah === "pilih" && (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLangkah("jalur")} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
                  <p className="text-sm font-semibold text-gray-600">Pilih jenis pelanggaran — {jalur === "training" ? "Training" : "Staff"}</p>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari pelanggaran…" className="input pl-9" />
                </div>
                <div className="max-h-[55vh] overflow-y-auto space-y-3 -mx-1 px-1">
                  {TIER_ORDER.map((t) => {
                    const items = masterHasil.filter((m) => m.tier === t);
                    if (items.length === 0) return null;
                    return (
                      <div key={t}>
                        <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">{TIER_LABEL[t]}</p>
                        <div className="space-y-1.5">
                          {items.map((m) => (
                            <button key={m.id} onClick={() => pilihPelanggaran(m)}
                              className="w-full text-left rounded-xl border border-gray-100 p-2.5 hover:border-red-200 hover:bg-red-50/30 transition-colors flex items-center justify-between gap-2">
                              <span className="text-sm text-gray-700 leading-snug">{m.nama_pelanggaran}</span>
                              <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${TIER_BADGE[t]}`}>{m.poin} poin</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {masterHasil.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Tidak ditemukan</p>}
                </div>
              </>
            )}

            {/* Langkah 3: form detail */}
            {langkah === "form" && pel && (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLangkah("pilih")} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
                  <p className="text-sm font-semibold text-gray-600">Detail Laporan</p>
                </div>

                <div className="rounded-xl bg-red-50 border border-red-100 p-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-red-700">{pel.nama_pelanggaran}</p>
                    <p className="text-[11px] text-red-500">{TIER_LABEL[pel.tier]} · {pel.poin} poin</p>
                    {pel.catatan && <p className="text-[11px] text-gray-500 italic mt-0.5">{pel.catatan}</p>}
                  </div>
                  <button onClick={() => setLangkah("pilih")} className="text-[11px] font-semibold text-red-600 hover:underline shrink-0">Ganti</button>
                </div>

                <div>
                  <label className="label">Karyawan ({jalur === "training" ? "Training" : "Staff"})</label>
                  <input value={cariKaryawan} onChange={(e) => setCariKaryawan(e.target.value)} placeholder="Cari nama…" className="input mb-1.5" />
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {karyawanHasil.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Tidak ditemukan</p>}
                    {karyawanHasil.map((k) => (
                      <button key={k.id} onClick={() => setKId(k.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${kId === k.id ? "bg-red-50 text-red-700 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}>
                        {k.nama} {kId === k.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Tanggal Kejadian</label>
                    <input type="date" className="input" value={tgl} onChange={(e) => setTgl(e.target.value)} max={todayWIB()} />
                  </div>
                  <div>
                    <label className="label">Jam Kejadian</label>
                    <input type="time" className="input" value={jam} onChange={(e) => setJam(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="label">Catatan Tambahan (opsional)</label>
                  <textarea className="input" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Jelaskan kejadiannya, kalau perlu…" />
                </div>

                <div>
                  <label className="label">Lampiran Foto (opsional, boleh lebih dari satu)</label>
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 cursor-pointer hover:border-red-200 hover:text-red-500">
                    <Camera size={16} /> Pilih dari galeri/file
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => setFotoFiles(Array.from(e.target.files ?? []))} />
                  </label>
                  {fotoFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {fotoFiles.map((f, i) => (
                        <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setFotoFiles((fs) => fs.filter((_, j) => j !== i))}
                            className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Saksi (opsional)</label>
                  <div className="flex gap-1.5 mb-1.5">
                    {([["none", "Tidak ada"], ["karyawan", "Pilih karyawan"], ["manual", "Tulis manual"]] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setSaksiMode(k)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${saksiMode === k ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}>{l}</button>
                    ))}
                  </div>
                  {saksiMode === "karyawan" && (
                    <select className="input" value={saksiKId} onChange={(e) => setSaksiKId(e.target.value)}>
                      <option value="">Pilih karyawan…</option>
                      {karyawan.filter((k) => k.id !== kId).map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                  )}
                  {saksiMode === "manual" && (
                    <input className="input" value={saksiManual} onChange={(e) => setSaksiManual(e.target.value)} placeholder="Nama saksi (bukan karyawan sistem)" />
                  )}
                </div>

                {err && <p className="text-sm text-red-500">{err}</p>}
                <button onClick={submitLapor} disabled={busy || !kId} className="btn-primary w-full">{busy ? "Mengirim…" : "Kirim Laporan"}</button>
                <p className="text-[11px] text-gray-400 text-center">Poin masuk resmi setelah Manajer Operasional memutuskan.</p>
              </>
            )}

            {msg && <p className="text-sm text-green-600">{msg}</p>}
          </div>

          <div className="card space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm">Laporan Saya ({riwayat.length})</h2>
            {riwayat.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Belum ada laporan</p>
              : riwayat.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.karyawan?.nama} · {r.master_pelanggaran?.nama_pelanggaran} <span className="text-gray-400">({r.master_pelanggaran?.poin} poin)</span></p>
                    <p className="text-xs text-gray-500">{r.tanggal_kejadian}{r.jam_kejadian ? ` ${r.jam_kejadian.slice(0, 5)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeStatus(r.status)}`}>{labelStatus(r.status)}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* ══════════ TAB INSIDEN BERAT ══════════ */}
      {tab === "insiden" && (
        <>
          <div className="card space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">Untuk pelanggaran berat (Tier 4) yang berujung PHK langsung tanpa sistem poin. Langsung ditindaklanjuti Manajer Operasional.</p>
            </div>
            <div>
              <label className="label">Karyawan</label>
              <select className="input" value={iKid} onChange={(e) => setIKid(e.target.value)}>
                <option value="">Pilih karyawan…</option>
                {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Jenis Insiden</label>
              <select className="input" value={iPelId} onChange={(e) => setIPelId(e.target.value)}>
                <option value="">Pilih jenis insiden…</option>
                {tier4.map((t) => <option key={t.id} value={t.id}>{t.nama_pelanggaran}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal Kejadian</label>
              <input type="date" className="input" value={iTgl} onChange={(e) => setITgl(e.target.value)} max={todayWIB()} />
            </div>
            <div>
              <label className="label">Keterangan (wajib)</label>
              <textarea className="input" rows={2} value={iKet} onChange={(e) => setIKet(e.target.value)} placeholder="Jelaskan kejadiannya…" />
            </div>
            <div>
              <label className="label">Lampiran Foto (opsional)</label>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 cursor-pointer hover:border-red-200 hover:text-red-500">
                <Camera size={16} /> Pilih dari galeri/file
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setIFotoFiles(Array.from(e.target.files ?? []))} />
              </label>
              {iFotoFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {iFotoFiles.map((f, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setIFotoFiles((fs) => fs.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {iErr && <p className="text-sm text-red-500">{iErr}</p>}
            {iMsg && <p className="text-sm text-green-600">{iMsg}</p>}
            <button onClick={submitInsiden} disabled={iBusy} className="w-full py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-40">{iBusy ? "Mengirim…" : "Kirim Laporan Insiden"}</button>
          </div>

          <div className="card space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm">Laporan Insiden Saya ({riwayatInsiden.length})</h2>
            {riwayatInsiden.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Belum ada laporan</p>
              : riwayatInsiden.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.karyawan?.nama} · {r.jenis_insiden}</p>
                    <p className="text-xs text-gray-500">{r.tanggal_kejadian}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{r.status}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
