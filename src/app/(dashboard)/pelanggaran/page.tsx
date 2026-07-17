"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { tambahPoin, kuartalSekarang, labelKuartal, POIN_PER_SP } from "@/lib/poin";
import { ShieldAlert, AlertTriangle, CheckCircle2, X, Trash2 } from "lucide-react";

interface Karyawan { id: string; nama: string }
interface Laporan {
  id: string; karyawan_id: string; pelanggaran_id: string; tanggal_kejadian: string;
  keterangan: string; foto_bukti_url: string | null; status: string; dilaporkan_oleh: string;
  catatan_review: string | null;
  karyawan: { nama: string } | null; master_pelanggaran: { nama_pelanggaran: string; poin: number; tier: string } | null;
}
interface PoinRow { id: string; karyawan_id: string; poin: number; sumber: string; tanggal: string; kuartal: string; catatan: string | null; master_pelanggaran: { nama_pelanggaran: string } | null }
interface SPRow { karyawan_id: string; level_sp: number; kuartal_kena: string; tanggal_sp: string }
interface Insiden { id: string; jenis_insiden: string; tanggal_kejadian: string; keterangan: string; foto_bukti_url: string | null; status: string; dilaporkan_oleh: string; karyawan: { nama: string } | null }

export default function PelanggaranPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"review" | "poin" | "insiden">("review");
  const [laporan, setLaporan] = useState<Laporan[]>([]);
  const [poin, setPoin] = useState<PoinRow[]>([]);
  const [sp, setSp] = useState<SPRow[]>([]);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [insiden, setInsiden] = useState<Insiden[]>([]);
  const [kuartal, setKuartal] = useState(kuartalSekarang());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [detailK, setDetailK] = useState<Karyawan | null>(null);
  const [catatanMap, setCatatanMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    const [lRes, kRes, iRes] = await Promise.all([
      supabase.from("laporan_pelanggaran").select("id, karyawan_id, pelanggaran_id, tanggal_kejadian, keterangan, foto_bukti_url, status, dilaporkan_oleh, catatan_review, karyawan:karyawan_id(nama), master_pelanggaran:pelanggaran_id(nama_pelanggaran, poin, tier)").order("created_at", { ascending: false }).limit(200),
      supabase.from("karyawan").select("id, nama").eq("status", "aktif").order("nama"),
      supabase.from("laporan_insiden_berat").select("id, jenis_insiden, tanggal_kejadian, keterangan, foto_bukti_url, status, dilaporkan_oleh, karyawan:karyawan_id(nama)").order("created_at", { ascending: false }).limit(100),
    ]);
    setLaporan((lRes.data as unknown as Laporan[]) ?? []);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setInsiden((iRes.data as unknown as Insiden[]) ?? []);
    fetchPoin();
  }, []);

  const fetchPoin = useCallback(async () => {
    const [pRes, sRes] = await Promise.all([
      supabase.from("poin_karyawan").select("id, karyawan_id, poin, sumber, tanggal, kuartal, catatan, master_pelanggaran:pelanggaran_id(nama_pelanggaran)").order("tanggal", { ascending: false }).limit(1000),
      supabase.from("status_sp_karyawan").select("karyawan_id, level_sp, kuartal_kena, tanggal_sp").eq("is_aktif", true),
    ]);
    setPoin((pRes.data as unknown as PoinRow[]) ?? []);
    setSp((sRes.data as SPRow[]) ?? []);
  }, []);

  async function terima(l: Laporan) {
    if (!user || !l.master_pelanggaran) return;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({ status: "diterima", direview_oleh: user.nama, direview_at: new Date().toISOString(), catatan_review: catatanMap[l.id] || null }).eq("id", l.id);
    await tambahPoin({ karyawan_id: l.karyawan_id, pelanggaran_id: l.pelanggaran_id, poin: Number(l.master_pelanggaran.poin), sumber: "manual", tanggal: l.tanggal_kejadian, laporan_id: l.id });
    setBusyId(null); fetchAll();
  }
  async function tolak(l: Laporan) {
    if (!user) return;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({ status: "ditolak", direview_oleh: user.nama, direview_at: new Date().toISOString(), catatan_review: catatanMap[l.id] || null }).eq("id", l.id);
    setBusyId(null); fetchAll();
  }
  async function hapusPoin(id: string) {
    if (!confirm("Hapus poin ini?")) return;
    await supabase.from("poin_karyawan").delete().eq("id", id);
    fetchPoin();
  }
  async function setInsidenStatus(id: string, status: string) {
    await supabase.from("laporan_insiden_berat").update({ status }).eq("id", id);
    fetchAll();
  }

  const pending = laporan.filter((l) => l.status === "pending");
  const reviewed = laporan.filter((l) => l.status !== "pending");

  // agregasi poin per karyawan (kuartal terpilih)
  const poinKuartal = poin.filter((p) => p.kuartal === kuartal);
  const poinOf = (kid: string) => poinKuartal.filter((p) => p.karyawan_id === kid).reduce((s, p) => s + Number(p.poin), 0);
  const spOf = (kid: string) => sp.filter((s) => s.karyawan_id === kid).reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const spBeforeQuarter = (kid: string) => sp.filter((s) => s.karyawan_id === kid && s.kuartal_kena !== kuartal).reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const nextSPInfo = (kid: string) => {
    const q = poinOf(kid); const before = spBeforeQuarter(kid);
    const cur = Math.min(3, before + Math.floor(q / POIN_PER_SP));
    if (cur >= 3) return { text: "SP3 (maksimal)", danger: true };
    const menuju = cur + 1; const sisa = POIN_PER_SP - (q % POIN_PER_SP);
    return { text: `${q % POIN_PER_SP} dari ${POIN_PER_SP} menuju SP${menuju}`, danger: false };
  };
  const sp3List = karyawan.filter((k) => spOf(k.id) >= 3);

  const kuartalOptions = Array.from(new Set([kuartalSekarang(), ...poin.map((p) => p.kuartal)]));
  const tierBadge = (t?: string) => t === "tier3" ? "bg-red-100 text-red-600" : t === "tier2" ? "bg-orange-100 text-orange-600" : "bg-yellow-100 text-yellow-700";

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} className="text-red-500" />
        <h1 className="text-xl font-bold text-gray-800">Pelanggaran &amp; Poin</h1>
      </div>

      {/* Flag SP3 */}
      {sp3List.length > 0 && (
        <div className="rounded-xl bg-red-50 border-2 border-red-300 p-3">
          {sp3List.map((k) => (
            <p key={k.id} className="text-sm font-bold text-red-700">⚠️ {k.nama} mencapai SP3 (15 poin) — perlu tindakan manajemen</p>
          ))}
        </div>
      )}

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 max-w-xl">
        {([["review", `Review Laporan${pending.length ? ` (${pending.length})` : ""}`], ["poin", "Poin Karyawan"], ["insiden", "Insiden Berat"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>

      {/* TAB 1 — REVIEW */}
      {tab === "review" && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Menunggu Review ({pending.length})</h2>
            {pending.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Tidak ada laporan pending</p>
              : pending.map((l) => (
                <div key={l.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{l.karyawan?.nama}</p>
                      <p className="text-xs text-gray-600">{l.master_pelanggaran?.nama_pelanggaran} <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tierBadge(l.master_pelanggaran?.tier)}`}>{l.master_pelanggaran?.poin} poin</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">{l.tanggal_kejadian} · oleh {l.dilaporkan_oleh}</p>
                      <p className="text-xs text-gray-600 italic mt-0.5">&ldquo;{l.keterangan}&rdquo;</p>
                    </div>
                    {l.foto_bukti_url && (
                      <button onClick={() => setFotoModal(l.foto_bukti_url)} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={l.foto_bukti_url} alt="bukti" className="w-full h-full object-cover" />
                      </button>
                    )}
                  </div>
                  <input className="input py-1.5 text-sm" placeholder="Catatan review (opsional)" value={catatanMap[l.id] ?? ""} onChange={(e) => setCatatanMap((m) => ({ ...m, [l.id]: e.target.value }))} />
                  <div className="flex gap-2">
                    <button onClick={() => terima(l)} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40">Terima (+{l.master_pelanggaran?.poin} poin)</button>
                    <button onClick={() => tolak(l)} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40">Tolak</button>
                  </div>
                </div>
              ))}
          </div>

          {reviewed.length > 0 && (
            <div className="card space-y-1.5">
              <h2 className="font-semibold text-gray-700 text-sm">Riwayat Direview ({reviewed.length})</h2>
              {reviewed.slice(0, 30).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-700">{l.karyawan?.nama} · {l.master_pelanggaran?.nama_pelanggaran}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${l.status === "diterima" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>{l.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2 — POIN */}
      {tab === "poin" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-700 text-sm">Poin per Karyawan</h2>
            <select className="input py-1.5 text-sm w-auto" value={kuartal} onChange={(e) => setKuartal(e.target.value)}>
              {kuartalOptions.map((k) => <option key={k} value={k}>{labelKuartal(k)}</option>)}
            </select>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="px-3 py-2">Karyawan</th><th className="px-3 py-2 text-right">Poin Kuartal</th><th className="px-3 py-2">Status SP</th><th className="px-3 py-2">Progress</th>
              </tr></thead>
              <tbody>
                {karyawan.map((k) => {
                  const q = poinOf(k.id); const spLvl = spOf(k.id); const info = nextSPInfo(k.id);
                  return (
                    <tr key={k.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setDetailK(k)}>
                      <td className="px-3 py-2 font-medium text-gray-800">{k.nama}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{q}</td>
                      <td className="px-3 py-2">{spLvl > 0 ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${spLvl >= 3 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>SP{spLvl}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-xs ${info.danger ? "text-red-600 font-semibold" : "text-gray-500"}`}>{info.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3 — INSIDEN */}
      {tab === "insiden" && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Insiden Berat (Tier 4)</h2>
          {insiden.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Tidak ada laporan insiden</p>
            : insiden.map((i) => (
              <div key={i.id} className="rounded-xl border-2 border-red-200 bg-red-50/50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> {i.jenis_insiden}</p>
                    <p className="text-xs text-gray-700 font-medium">{i.karyawan?.nama} · {i.tanggal_kejadian}</p>
                    <p className="text-xs text-gray-600 italic mt-0.5">&ldquo;{i.keterangan}&rdquo;</p>
                    <p className="text-[11px] text-gray-400">Dilapor oleh {i.dilaporkan_oleh}</p>
                  </div>
                  {i.foto_bukti_url && (
                    <button onClick={() => setFotoModal(i.foto_bukti_url)} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.foto_bukti_url} alt="bukti" className="w-full h-full object-cover" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Status:</span>
                  <select className="input py-1 text-xs w-auto" value={i.status} onChange={(e) => setInsidenStatus(i.id, e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="ditindaklanjuti">Ditindaklanjuti</option>
                    <option value="selesai">Selesai</option>
                  </select>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Foto modal */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setFotoModal(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoModal} alt="bukti" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}

      {/* Detail poin karyawan */}
      {detailK && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailK(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800">{detailK.nama}</p>
                <p className="text-xs text-gray-500">{labelKuartal(kuartal)} · {poinOf(detailK.id)} poin · SP{spOf(detailK.id) || 0}</p>
              </div>
              <button onClick={() => setDetailK(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-1">
              {poinKuartal.filter((p) => p.karyawan_id === detailK.id).length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Belum ada poin kuartal ini</p>
                : poinKuartal.filter((p) => p.karyawan_id === detailK.id).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{p.master_pelanggaran?.nama_pelanggaran ?? p.catatan ?? "Poin"}</p>
                      <p className="text-[11px] text-gray-400">{p.tanggal} · {p.sumber}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-red-600">+{p.poin}</span>
                      <button onClick={() => hapusPoin(p.id)} className="text-gray-300 hover:text-red-500" title="Hapus poin"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
            </div>
            {sp.filter((s) => s.karyawan_id === detailK.id).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-1">Riwayat SP</p>
                {sp.filter((s) => s.karyawan_id === detailK.id).sort((a, b) => a.level_sp - b.level_sp).map((s, i) => (
                  <p key={i} className="text-xs text-gray-600">SP{s.level_sp} · {s.tanggal_sp} · {labelKuartal(s.kuartal_kena)}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
