"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { tambahPoin, kuartalSekarang, labelKuartal, POIN_PER_SP } from "@/lib/poin";
import {
  ambilSpvKhusus, TIER_LABEL, TIER_BADGE, labelStatus, badgeStatus,
  hitungKlarifikasiDeadline, prosesOtomatisTanpaKlarifikasi,
  type MasterPelanggaranRow, type StatusLaporan,
} from "@/lib/pelanggaranAlur";
import { ShieldAlert, AlertTriangle, X, Trash2, Clock, MessageSquareWarning, Plus, ChevronDown } from "lucide-react";

interface Karyawan { id: string; nama: string; kategori_dokumen: string | null }
interface Laporan {
  id: string; karyawan_id: string; pelanggaran_id: string; tanggal_kejadian: string; jam_kejadian: string | null;
  keterangan: string | null; foto_bukti_urls: string[] | null; status: StatusLaporan; dilaporkan_oleh: string;
  catatan_review: string | null; created_at: string; respon_deadline: string | null;
  direview_oleh: string | null; direview_at: string | null;
  klarifikasi_diminta_at: string | null; klarifikasi_deadline: string | null; klarifikasi_catatan: string | null;
  saksi_manual: string | null; saksi_karyawan_id: string | null; poin_override: number | null; audit_hasil_id: string | null;
  karyawan: { nama: string } | null; master_pelanggaran: { nama_pelanggaran: string; poin: number; tier: string } | null;
  saksi: { nama: string } | null;
}
function poinLaporan(l: Laporan): number {
  return l.poin_override ?? Number(l.master_pelanggaran?.poin ?? 0);
}
interface PoinRow { id: string; karyawan_id: string; poin: number; sumber: string; tanggal: string; kuartal: string; catatan: string | null; master_pelanggaran: { nama_pelanggaran: string } | null }
interface SPRow { karyawan_id: string; level_sp: number; kuartal_kena: string; tanggal_sp: string }
interface Insiden { id: string; jenis_insiden: string; tanggal_kejadian: string; keterangan: string | null; foto_bukti_urls: string[] | null; status: string; dilaporkan_oleh: string; karyawan: { nama: string } | null }

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// tanggal_kejadian (YYYY-MM-DD) + jam_kejadian (HH:MM:SS) → "DD/MM/YYYY HH:MM"
function tglJamKejadian(tanggal: string, jam: string | null) {
  const [y, m, d] = tanggal.split("-");
  return `${d}/${m}/${y}${jam ? ` ${jam.slice(0, 5)}` : ""}`;
}
function jalurDariKategori(k: string | null): "training" | "staff" | "spv" | null {
  if (!k) return null;
  if (k.startsWith("training")) return "training";
  if (k.startsWith("staff")) return "staff";
  if (k === "spv") return "spv";
  return null;
}
function sisaWaktu(deadlineIso: string | null): { teks: string; lewat: boolean } | null {
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return { teks: "Lewat batas waktu", lewat: true };
  const jam = Math.floor(ms / 3600_000);
  const menit = Math.floor((ms % 3600_000) / 60_000);
  return { teks: jam > 0 ? `${jam} jam ${menit} menit lagi` : `${menit} menit lagi`, lewat: false };
}

export default function PelanggaranPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"review" | "insiden" | "poin">("review");
  const [laporan, setLaporan] = useState<Laporan[]>([]);
  const [poin, setPoin] = useState<PoinRow[]>([]);
  const [sp, setSp] = useState<SPRow[]>([]);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [insiden, setInsiden] = useState<Insiden[]>([]);
  const [kuartal, setKuartal] = useState(kuartalSekarang());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string[] | null>(null);
  const [detailK, setDetailK] = useState<Karyawan | null>(null);
  const [klarifikasiModal, setKlarifikasiModal] = useState<Laporan | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<{ l: Laporan; aksi: "terima" | "tolak" } | null>(null);
  const [expandRiwayat, setExpandRiwayat] = useState<string | null>(null);
  const [klarifikasiCatatan, setKlarifikasiCatatan] = useState("");
  const [khususModal, setKhususModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function init() {
    setLoading(true);
    await prosesOtomatisTanpaKlarifikasi(); // "cron ringan": laporan pending lewat 2x24 jam tanpa klarifikasi → otomatis diterima
    await fetchAll();
    setLoading(false);
  }

  const fetchAll = useCallback(async () => {
    const [lRes, kRes, iRes] = await Promise.all([
      supabase.from("laporan_pelanggaran")
        .select("id, karyawan_id, pelanggaran_id, tanggal_kejadian, jam_kejadian, keterangan, foto_bukti_urls, status, dilaporkan_oleh, catatan_review, created_at, respon_deadline, direview_oleh, direview_at, klarifikasi_diminta_at, klarifikasi_deadline, klarifikasi_catatan, saksi_manual, saksi_karyawan_id, poin_override, audit_hasil_id, karyawan:karyawan_id(nama), master_pelanggaran:pelanggaran_id(nama_pelanggaran, poin, tier), saksi:saksi_karyawan_id(nama)")
        .order("created_at", { ascending: false }).limit(300),
      supabase.from("karyawan").select("id, nama, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("laporan_insiden_berat").select("id, jenis_insiden, tanggal_kejadian, keterangan, foto_bukti_urls, status, dilaporkan_oleh, karyawan:karyawan_id(nama)").order("created_at", { ascending: false }).limit(100),
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

  async function terimaLangsung(l: Laporan) {
    if (!user || !l.master_pelanggaran) return;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({ status: "diterima", direview_oleh: user.nama, direview_at: new Date().toISOString() }).eq("id", l.id);
    await tambahPoin({ karyawan_id: l.karyawan_id, pelanggaran_id: l.pelanggaran_id, poin: poinLaporan(l), sumber: "manual", tanggal: l.tanggal_kejadian, laporan_id: l.id });
    setBusyId(null); setKonfirmasi(null); fetchAll();
  }
  async function tolakLangsung(l: Laporan) {
    if (!user) return;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({ status: "ditolak", direview_oleh: user.nama, direview_at: new Date().toISOString() }).eq("id", l.id);
    setBusyId(null); setKonfirmasi(null); fetchAll();
  }

  // ── Klarifikasi ──
  async function beriWaktuTambahan(l: Laporan) {
    const jam = prompt("Tambahan berapa jam?", "24");
    if (!jam || isNaN(Number(jam))) return;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({
      klarifikasi_deadline: hitungKlarifikasiDeadline(new Date().toISOString(), Number(jam)),
    }).eq("id", l.id);
    setBusyId(null); fetchAll();
  }
  async function anggapTidakHadir(l: Laporan) {
    if (!user || !l.master_pelanggaran) return;
    if (!confirm(`Tetapkan poin untuk ${l.karyawan?.nama} karena tidak hadir klarifikasi?`)) return;
    setBusyId(l.id);
    const catatan = "Karyawan meminta klarifikasi namun tidak hadir dalam batas waktu yang diberikan.";
    await supabase.from("laporan_pelanggaran").update({
      status: "diterima", direview_oleh: user.nama, direview_at: new Date().toISOString(), catatan_review: catatan,
    }).eq("id", l.id);
    await tambahPoin({ karyawan_id: l.karyawan_id, pelanggaran_id: l.pelanggaran_id, poin: poinLaporan(l), sumber: "manual", tanggal: l.tanggal_kejadian, laporan_id: l.id, catatan });
    setBusyId(null); fetchAll();
  }
  async function simpanKlarifikasi(keputusan: "diterima" | "ditolak") {
    if (!user || !klarifikasiModal || !klarifikasiCatatan.trim()) return;
    const l = klarifikasiModal;
    setBusyId(l.id);
    await supabase.from("laporan_pelanggaran").update({
      status: keputusan, direview_oleh: user.nama, direview_at: new Date().toISOString(),
      klarifikasi_catatan: klarifikasiCatatan.trim(), catatan_review: klarifikasiCatatan.trim(),
    }).eq("id", l.id);
    if (keputusan === "diterima" && l.master_pelanggaran) {
      await tambahPoin({ karyawan_id: l.karyawan_id, pelanggaran_id: l.pelanggaran_id, poin: poinLaporan(l), sumber: "manual", tanggal: l.tanggal_kejadian, laporan_id: l.id, catatan: klarifikasiCatatan.trim() });
    }
    setBusyId(null); setKlarifikasiModal(null); setKlarifikasiCatatan(""); fetchAll();
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
  const menungguKlarifikasi = laporan.filter((l) => l.status === "menunggu_klarifikasi");
  const reviewed = laporan.filter((l) => l.status === "diterima" || l.status === "ditolak");

  const poinKuartal = poin.filter((p) => p.kuartal === kuartal);
  const poinOf = (kid: string) => poinKuartal.filter((p) => p.karyawan_id === kid).reduce((s, p) => s + Number(p.poin), 0);
  const spOf = (kid: string) => sp.filter((s) => s.karyawan_id === kid).reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const spBeforeQuarter = (kid: string) => sp.filter((s) => s.karyawan_id === kid && s.kuartal_kena !== kuartal).reduce((mx, s) => Math.max(mx, s.level_sp), 0);
  const nextSPInfo = (kid: string) => {
    const q = poinOf(kid); const before = spBeforeQuarter(kid);
    const cur = Math.min(3, before + Math.floor(q / POIN_PER_SP));
    if (cur >= 3) return { text: "SP3 (maksimal)", danger: true };
    const menuju = cur + 1; const sisa = q % POIN_PER_SP;
    return { text: `${sisa} dari ${POIN_PER_SP} menuju SP${menuju}`, danger: sisa >= POIN_PER_SP - 1 };
  };
  const sp3List = karyawan.filter((k) => spOf(k.id) >= 3);
  const remindersKlarifikasi = menungguKlarifikasi.filter((l) => sisaWaktu(l.klarifikasi_deadline)?.lewat);

  const kuartalOptions = Array.from(new Set([kuartalSekarang(), ...poin.map((p) => p.kuartal)]));

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <ShieldAlert size={20} className="text-red-500" />
        <h1 className="text-xl font-bold text-gray-800">Pelanggaran &amp; Poin</h1>
      </div>

      {sp3List.length > 0 && (
        <div className="rounded-xl bg-red-50 border-2 border-red-300 p-3">
          {sp3List.map((k) => (
            <p key={k.id} className="text-sm font-bold text-red-700">⚠️ {k.nama} mencapai SP3 (15 poin) — perlu tindakan manajemen</p>
          ))}
        </div>
      )}
      {remindersKlarifikasi.length > 0 && (
        <div className="rounded-xl bg-blue-50 border-2 border-blue-300 p-3 space-y-1">
          {remindersKlarifikasi.map((l) => (
            <p key={l.id} className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
              <MessageSquareWarning size={15} /> {l.karyawan?.nama} minta klarifikasi tapi belum datang — bagaimana tindak lanjutnya?
            </p>
          ))}
        </div>
      )}

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 max-w-xl overflow-x-auto">
        {([
          ["review", `Review Antrian${pending.length + menungguKlarifikasi.length ? ` (${pending.length + menungguKlarifikasi.length})` : ""}`],
          ["insiden", "Insiden Berat"],
          ["poin", "Poin & SP Karyawan"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === k ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-400 text-center py-8">Memuat…</p> : (
      <>
      {/* ══════════ TAB REVIEW ══════════ */}
      {tab === "review" && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Menunggu ({pending.length})</h2>
            {pending.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Tidak ada laporan menunggu</p>
              : pending.map((l) => {
                const sisa = sisaWaktu(l.respon_deadline);
                return (
                  <div key={l.id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{l.karyawan?.nama}</p>
                        <p className="text-xs text-gray-600">{l.master_pelanggaran?.nama_pelanggaran} <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TIER_BADGE[l.master_pelanggaran?.tier ?? ""] ?? "bg-gray-100 text-gray-600"}`}>{poinLaporan(l)} poin</span>{l.audit_hasil_id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 ml-1">Audit Kebersihan</span>}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tglJamKejadian(l.tanggal_kejadian, l.jam_kejadian)} · oleh {l.dilaporkan_oleh}</p>
                        {l.keterangan && <p className="text-xs text-gray-600 italic mt-0.5">&ldquo;{l.keterangan}&rdquo;</p>}
                        {(l.saksi?.nama || l.saksi_manual) && <p className="text-[11px] text-gray-400 mt-0.5">Saksi: {l.saksi?.nama ?? l.saksi_manual}</p>}
                        {sisa && <p className={`text-[11px] mt-1 flex items-center gap-1 ${sisa.lewat ? "text-red-500 font-semibold" : "text-gray-400"}`}><Clock size={11} /> {sisa.teks}</p>}
                      </div>
                      {!!l.foto_bukti_urls?.length && (
                        <button onClick={() => setFotoModal(l.foto_bukti_urls)} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0 relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={l.foto_bukti_urls[0]} alt="bukti" className="w-full h-full object-cover" />
                          {l.foto_bukti_urls.length > 1 && <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl">+{l.foto_bukti_urls.length - 1}</span>}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setKonfirmasi({ l, aksi: "terima" })} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40">Terima Sekarang (+{poinLaporan(l)} poin)</button>
                      <button onClick={() => setKonfirmasi({ l, aksi: "tolak" })} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40">Tolak</button>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Menunggu Klarifikasi ({menungguKlarifikasi.length})</h2>
            {menungguKlarifikasi.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Tidak ada</p>
              : menungguKlarifikasi.map((l) => {
                const sisa = sisaWaktu(l.klarifikasi_deadline);
                return (
                  <div key={l.id} className={`rounded-xl border p-3 space-y-2 ${sisa?.lewat ? "border-blue-300 bg-blue-50/60" : "border-blue-100 bg-blue-50/30"}`}>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{l.karyawan?.nama}</p>
                      <p className="text-xs text-gray-600">{l.master_pelanggaran?.nama_pelanggaran} <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{poinLaporan(l)} poin</span>{l.audit_hasil_id && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 ml-1">Audit Kebersihan</span>}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Minta klarifikasi sejak {l.klarifikasi_diminta_at ? tglWaktu(l.klarifikasi_diminta_at) : "-"}</p>
                      {sisa && <p className={`text-[11px] mt-1 flex items-center gap-1 ${sisa.lewat ? "text-blue-700 font-semibold" : "text-gray-400"}`}><Clock size={11} /> {sisa.teks}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setKlarifikasiModal(l); setKlarifikasiCatatan(""); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600">Catat Klarifikasi Sekarang</button>
                      {sisa?.lewat && (
                        <>
                          <button onClick={() => beriWaktuTambahan(l)} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Beri Waktu Tambahan</button>
                          <button onClick={() => anggapTidakHadir(l)} disabled={busyId === l.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40">Anggap Tidak Hadir</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {reviewed.length > 0 && (
            <div className="card space-y-1.5">
              <h2 className="font-semibold text-gray-700 text-sm">Riwayat Direview ({reviewed.length})</h2>
              {reviewed.slice(0, 30).map((l) => {
                const buka = expandRiwayat === l.id;
                return (
                  <div key={l.id} className="border-b border-gray-50 last:border-0">
                    <button onClick={() => setExpandRiwayat(buka ? null : l.id)} className="w-full flex items-center justify-between gap-2 py-1.5 text-sm text-left hover:bg-gray-50/60 rounded-lg px-1 -mx-1">
                      <span className="text-gray-700 truncate flex items-center gap-1">
                        <ChevronDown size={13} className={`text-gray-400 shrink-0 transition-transform ${buka ? "rotate-180" : ""}`} />
                        {l.karyawan?.nama} · {l.master_pelanggaran?.nama_pelanggaran}
                      </span>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeStatus(l.status)}`}>{labelStatus(l.status)}</span>
                    </button>
                    {buka && (
                      <div className="pb-2.5 px-1 space-y-1.5 text-xs">
                        <p className="text-gray-500">{tglJamKejadian(l.tanggal_kejadian, l.jam_kejadian)} · dilaporkan oleh {l.dilaporkan_oleh} · {poinLaporan(l)} poin</p>
                        {l.keterangan && <p className="text-gray-600 italic">&ldquo;{l.keterangan}&rdquo;</p>}
                        {(l.saksi?.nama || l.saksi_manual) && <p className="text-gray-500">Saksi: {l.saksi?.nama ?? l.saksi_manual}</p>}
                        {!!l.foto_bukti_urls?.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {l.foto_bukti_urls.map((url, i) => (
                              <button key={i} onClick={() => setFotoModal(l.foto_bukti_urls)} className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="bukti" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        {l.klarifikasi_catatan && <p className="text-blue-700 bg-blue-50 rounded-lg px-2 py-1.5">Klarifikasi: {l.klarifikasi_catatan}</p>}
                        {l.catatan_review && !l.klarifikasi_catatan && <p className="text-gray-500">Catatan review: {l.catatan_review}</p>}
                        <p className="text-gray-400">Direview oleh {l.direview_oleh ?? "-"}{l.direview_at ? ` · ${tglWaktu(l.direview_at)}` : ""}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB INSIDEN BERAT ══════════ */}
      {tab === "insiden" && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Insiden Berat (Tier 4)</h2>
          {insiden.length === 0 ? <p className="text-gray-400 text-sm text-center py-3">Tidak ada laporan insiden</p>
            : insiden.map((i) => (
              <div key={i.id} className="rounded-xl border-2 border-red-200 bg-red-50/50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> {i.jenis_insiden}</p>
                    <p className="text-xs text-gray-700 font-medium">{i.karyawan?.nama} · {tglJamKejadian(i.tanggal_kejadian, null)}</p>
                    {i.keterangan && <p className="text-xs text-gray-600 italic mt-0.5">&ldquo;{i.keterangan}&rdquo;</p>}
                    <p className="text-[11px] text-gray-400">Dilapor oleh {i.dilaporkan_oleh}</p>
                  </div>
                  {!!i.foto_bukti_urls?.length && (
                    <button onClick={() => setFotoModal(i.foto_bukti_urls)} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.foto_bukti_urls[0]} alt="bukti" className="w-full h-full object-cover" />
                      {i.foto_bukti_urls.length > 1 && <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl">+{i.foto_bukti_urls.length - 1}</span>}
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

      {/* ══════════ TAB POIN & SP ══════════ */}
      {tab === "poin" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-700 text-sm">Poin per Karyawan</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setKhususModal(true)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-800 text-white hover:bg-gray-700">
                <Plus size={12} /> Poin SPV Khusus
              </button>
              <select className="input py-1.5 text-sm w-auto" value={kuartal} onChange={(e) => setKuartal(e.target.value)}>
                {kuartalOptions.map((k) => <option key={k} value={k}>{labelKuartal(k)}</option>)}
              </select>
            </div>
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
      </>
      )}

      {/* Foto modal */}
      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setFotoModal(null)}>
          <div className="flex flex-wrap gap-3 justify-center">
            {fotoModal.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="bukti" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {/* Modal klarifikasi */}
      {klarifikasiModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setKlarifikasiModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800">{klarifikasiModal.karyawan?.nama}</p>
                <p className="text-xs text-gray-500">{klarifikasiModal.master_pelanggaran?.nama_pelanggaran} · {poinLaporan(klarifikasiModal)} poin</p>
              </div>
              <button onClick={() => setKlarifikasiModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div>
              <label className="label">Catatan klarifikasi (wajib) — ringkasan alasan karyawan & keputusan Anda</label>
              <textarea className="input" rows={4} value={klarifikasiCatatan} onChange={(e) => setKlarifikasiCatatan(e.target.value)} placeholder="Contoh: Karyawan menjelaskan bahwa keterlambatan disebabkan oleh... Keputusan: poin tetap ditetapkan karena..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => simpanKlarifikasi("ditolak")} disabled={!klarifikasiCatatan.trim() || busyId === klarifikasiModal.id}
                className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">Batalkan Poin</button>
              <button onClick={() => simpanKlarifikasi("diterima")} disabled={!klarifikasiCatatan.trim() || busyId === klarifikasiModal.id}
                className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40">Tetapkan Poin</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal konfirmasi terima/tolak — mencegah salah klik */}
      {konfirmasi && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setKonfirmasi(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={20} className={konfirmasi.aksi === "terima" ? "text-green-500 shrink-0" : "text-red-500 shrink-0"} />
              <div>
                <p className="font-bold text-gray-800">Apakah kamu yakin?</p>
                <p className="text-sm text-gray-600 mt-1">
                  {konfirmasi.aksi === "terima"
                    ? <>Menerima laporan <b>{konfirmasi.l.master_pelanggaran?.nama_pelanggaran}</b> untuk <b>{konfirmasi.l.karyawan?.nama}</b> — poin <b>+{poinLaporan(konfirmasi.l)}</b> langsung ditetapkan.</>
                    : <>Menolak laporan <b>{konfirmasi.l.master_pelanggaran?.nama_pelanggaran}</b> untuk <b>{konfirmasi.l.karyawan?.nama}</b> — tidak ada poin yang ditetapkan.</>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setKonfirmasi(null)} className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Batal</button>
              <button onClick={() => konfirmasi.aksi === "terima" ? terimaLangsung(konfirmasi.l) : tolakLangsung(konfirmasi.l)}
                disabled={busyId === konfirmasi.l.id}
                className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-40 ${konfirmasi.aksi === "terima" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}>
                {busyId === konfirmasi.l.id ? "Memproses…" : konfirmasi.aksi === "terima" ? "Ya, Terima" : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal poin SPV khusus */}
      {khususModal && (
        <ModalPoinSpvKhusus
          karyawanSpv={karyawan.filter((k) => jalurDariKategori(k.kategori_dokumen) === "spv")}
          adminNama={user?.nama ?? ""}
          onClose={() => setKhususModal(false)}
          onSaved={() => { setKhususModal(false); fetchAll(); }}
        />
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
                <p className="text-xs font-semibold text-gray-500 mb-1">Riwayat SP (tetap tampil walau poin sudah direset)</p>
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

// Poin SPV Khusus (Pasal 12 PP SPV) — ditetapkan LANGSUNG oleh Manajer
// Operasional, di luar alur submit-oleh-SPV. Otomatis "diterima" (bukan
// antrian) karena memang bukan hasil laporan pihak ketiga.
function ModalPoinSpvKhusus({ karyawanSpv, adminNama, onClose, onSaved }: {
  karyawanSpv: Karyawan[]; adminNama: string; onClose: () => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<MasterPelanggaranRow[]>([]);
  const [kId, setKId] = useState("");
  const [pelId, setPelId] = useState("");
  const [tgl, setTgl] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { ambilSpvKhusus().then(setItems); }, []);
  const pel = useMemo(() => items.find((i) => i.id === pelId) ?? null, [items, pelId]);

  async function simpan() {
    if (!kId || !pel) { setErr("Pilih karyawan SPV & jenis pelanggaran."); return; }
    setErr(""); setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { data: ins, error } = await supabase.from("laporan_pelanggaran").insert({
        karyawan_id: kId, pelanggaran_id: pel.id, tanggal_kejadian: tgl, jalur: "spv",
        dilaporkan_oleh: adminNama, keterangan: catatan.trim() || null,
        status: "diterima", direview_oleh: adminNama, direview_at: nowIso,
        catatan_review: "Pelanggaran khusus SPV (Pasal 12) — ditetapkan langsung oleh Manajer Operasional.",
      }).select("id").single();
      if (error) throw new Error(error.message);
      await tambahPoin({ karyawan_id: kId, pelanggaran_id: pel.id, poin: Number(pel.poin), sumber: "manual", tanggal: tgl, laporan_id: (ins as { id: string }).id });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800">Poin SPV Khusus (Pasal 12)</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <p className="text-[11px] text-gray-400">Ditetapkan langsung oleh Manajer Operasional — tidak melalui antrian review.</p>
        <div>
          <label className="label">Karyawan SPV</label>
          <select className="input" value={kId} onChange={(e) => setKId(e.target.value)}>
            <option value="">Pilih…</option>
            {karyawanSpv.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Jenis Pelanggaran</label>
          <select className="input" value={pelId} onChange={(e) => setPelId(e.target.value)}>
            <option value="">Pilih…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.nama_pelanggaran} ({i.poin} poin)</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tanggal Kejadian</label>
          <input type="date" className="input" value={tgl} onChange={(e) => setTgl(e.target.value)} />
        </div>
        <div>
          <label className="label">Catatan (opsional)</label>
          <textarea className="input" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button onClick={simpan} disabled={busy} className="btn-primary w-full">{busy ? "Menyimpan…" : "Tetapkan Poin"}</button>
      </div>
    </div>
  );
}
