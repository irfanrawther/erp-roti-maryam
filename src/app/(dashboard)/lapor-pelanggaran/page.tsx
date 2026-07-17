"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { ShieldAlert, Camera, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Karyawan { id: string; nama: string }
interface Master { id: string; nama_pelanggaran: string; poin: number; tier: string }
interface Laporan {
  id: string; tanggal_kejadian: string; keterangan: string; status: string;
  karyawan: { nama: string } | null; master_pelanggaran: { nama_pelanggaran: string; poin: number } | null;
}

const TIER_LABEL: Record<string, string> = { tier1: "Tier 1 (ringan)", tier2: "Tier 2 (sedang)", tier3: "Tier 3 (berat)" };
const INSIDEN_TIER4 = [
  "Datang mabuk/terpengaruh narkoba", "Memalsukan absensi karyawan lain", "Pencurian signifikan",
  "Kekerasan fisik", "Sabotase produksi sengaja", "Pemalsuan data produksi sengaja",
];
function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }

export default function LaporPelanggaranPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [master, setMaster] = useState<Master[]>([]);
  const [riwayat, setRiwayat] = useState<Laporan[]>([]);
  const [tab, setTab] = useState<"lapor" | "insiden">("lapor");

  // form pelanggaran
  const [kId, setKId] = useState("");
  const [tgl, setTgl] = useState(todayWIB());
  const [pelId, setPelId] = useState("");
  const [ket, setKet] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  // form insiden
  const [iKid, setIKid] = useState("");
  const [iJenis, setIJenis] = useState(INSIDEN_TIER4[0]);
  const [iTgl, setITgl] = useState(todayWIB());
  const [iKet, setIKet] = useState("");
  const [iFoto, setIFoto] = useState<File | null>(null);
  const [iMsg, setIMsg] = useState(""); const [iErr, setIErr] = useState("");

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).laporPelanggaran) { router.replace(homeRoute(u)); return; }
    fetchAll(u);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async (u: UserSession) => {
    const [kRes, mRes] = await Promise.all([
      supabase.from("karyawan").select("id, nama").eq("status", "aktif").order("nama"),
      supabase.from("master_pelanggaran").select("id, nama_pelanggaran, poin, tier").eq("jenis", "manual").eq("is_aktif", true).order("tier"),
    ]);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setMaster((mRes.data as Master[]) ?? []);
    fetchRiwayat(u);
  }, []);

  async function fetchRiwayat(u: UserSession) {
    const { data } = await supabase.from("laporan_pelanggaran")
      .select("id, tanggal_kejadian, keterangan, status, karyawan:karyawan_id(nama), master_pelanggaran:pelanggaran_id(nama_pelanggaran, poin)")
      .eq("dilaporkan_oleh", u.nama).order("created_at", { ascending: false }).limit(50);
    setRiwayat((data as unknown as Laporan[]) ?? []);
  }

  async function uploadFoto(f: File): Promise<string> {
    const path = `pelanggaran/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const up = await supabase.storage.from("foto-absensi").upload(path, f, { contentType: f.type || "image/jpeg", upsert: true });
    if (up.error) throw new Error(up.error.message);
    return supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;
  }

  async function submitLapor() {
    if (!user || !kId || !pelId || !ket.trim()) { setErr("Karyawan, pelanggaran & keterangan wajib diisi"); return; }
    setErr(""); setMsg(""); setBusy(true);
    try {
      let fotoUrl: string | null = null;
      if (foto) fotoUrl = await uploadFoto(foto);
      const { error } = await supabase.from("laporan_pelanggaran").insert({
        karyawan_id: kId, pelanggaran_id: pelId, tanggal_kejadian: tgl,
        dilaporkan_oleh: user.nama, keterangan: ket.trim(), foto_bukti_url: fotoUrl, status: "pending",
      });
      if (error) throw new Error(error.message);
      setMsg("✓ Laporan terkirim, menunggu review Super Admin");
      setKId(""); setPelId(""); setKet(""); setFoto(null);
      fetchRiwayat(user);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal mengirim"); }
    finally { setBusy(false); }
  }

  async function submitInsiden() {
    if (!user || !iKid || !iKet.trim()) { setIErr("Karyawan & keterangan wajib diisi"); return; }
    setIErr(""); setIMsg(""); setBusy(true);
    try {
      let fotoUrl: string | null = null;
      if (iFoto) fotoUrl = await uploadFoto(iFoto);
      const { error } = await supabase.from("laporan_insiden_berat").insert({
        karyawan_id: iKid, jenis_insiden: iJenis, tanggal_kejadian: iTgl,
        dilaporkan_oleh: user.nama, keterangan: iKet.trim(), foto_bukti_url: fotoUrl, status: "pending",
      });
      if (error) throw new Error(error.message);
      setIMsg("✓ Laporan insiden terkirim ke manajemen");
      setIKid(""); setIKet(""); setIFoto(null);
    } catch (e) { setIErr(e instanceof Error ? e.message : "Gagal mengirim"); }
    finally { setBusy(false); }
  }

  const tiers = ["tier1", "tier2", "tier3"];
  const statusBadge = (s: string) => s === "diterima" ? "bg-green-100 text-green-700" : s === "ditolak" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700";

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} className="text-red-500" />
        <h1 className="text-xl font-bold text-gray-800">Lapor Pelanggaran</h1>
      </div>

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {([["lapor", "Lapor Pelanggaran"], ["insiden", "Insiden Berat (Tier 4)"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>

      {tab === "lapor" && (
        <>
          <div className="card space-y-3">
            <div>
              <label className="label">Karyawan</label>
              <select className="input" value={kId} onChange={(e) => setKId(e.target.value)}>
                <option value="">Pilih karyawan…</option>
                {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tanggal Kejadian</label>
              <input type="date" className="input" value={tgl} onChange={(e) => setTgl(e.target.value)} />
            </div>
            <div>
              <label className="label">Jenis Pelanggaran</label>
              <select className="input" value={pelId} onChange={(e) => setPelId(e.target.value)}>
                <option value="">Pilih pelanggaran…</option>
                {tiers.map((t) => (
                  <optgroup key={t} label={TIER_LABEL[t]}>
                    {master.filter((m) => m.tier === t).map((m) => <option key={m.id} value={m.id}>{m.nama_pelanggaran} ({m.poin} poin)</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Keterangan (wajib)</label>
              <textarea className="input" rows={2} value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Jelaskan kejadiannya…" />
            </div>
            <div>
              <label className="label">Foto Bukti (opsional)</label>
              <input type="file" accept="image/*" capture="environment" className="input py-2" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
            {msg && <p className="text-sm text-green-600">{msg}</p>}
            <button onClick={submitLapor} disabled={busy} className="btn-primary w-full">{busy ? "Mengirim…" : "Kirim Laporan"}</button>
            <p className="text-[11px] text-gray-400 text-center">Poin masuk setelah Super Admin menerima laporan.</p>
          </div>

          <div className="card space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm">Laporan Saya ({riwayat.length})</h2>
            {riwayat.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Belum ada laporan</p>
              : riwayat.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.karyawan?.nama} · {r.master_pelanggaran?.nama_pelanggaran} <span className="text-gray-400">({r.master_pelanggaran?.poin} poin)</span></p>
                    <p className="text-xs text-gray-500">{r.tanggal_kejadian} · {r.keterangan}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {tab === "insiden" && (
        <div className="card space-y-3">
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">Untuk pelanggaran berat. <b>Tidak menghasilkan poin</b> — akan ditindaklanjuti manajemen secara manual.</p>
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
            <select className="input" value={iJenis} onChange={(e) => setIJenis(e.target.value)}>
              {INSIDEN_TIER4.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tanggal Kejadian</label>
            <input type="date" className="input" value={iTgl} onChange={(e) => setITgl(e.target.value)} />
          </div>
          <div>
            <label className="label">Keterangan (wajib)</label>
            <textarea className="input" rows={2} value={iKet} onChange={(e) => setIKet(e.target.value)} placeholder="Jelaskan kejadiannya…" />
          </div>
          <div>
            <label className="label">Foto Bukti (opsional)</label>
            <input type="file" accept="image/*" capture="environment" className="input py-2" onChange={(e) => setIFoto(e.target.files?.[0] ?? null)} />
          </div>
          {iErr && <p className="text-sm text-red-500">{iErr}</p>}
          {iMsg && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 size={14} /> {iMsg}</p>}
          <button onClick={submitInsiden} disabled={busy} className="w-full py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-40">{busy ? "Mengirim…" : "Kirim Laporan Insiden"}</button>
        </div>
      )}
    </div>
  );
}
