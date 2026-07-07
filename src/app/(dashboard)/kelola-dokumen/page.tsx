"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { FileText, Upload, Plus, X, CheckCircle2, AlertCircle } from "lucide-react";

interface Dokumen {
  id: string; nama: string; file_pdf_url: string | null; versi: number; wajib_ttd: boolean; is_aktif: boolean; created_at: string;
}
interface Karyawan { id: string; nama: string }
interface Persetujuan {
  dokumen_id: string; dokumen_versi: number; karyawan_id: string; tipe: string;
  tanda_tangan_url: string | null; disetujui_at: string;
}

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function KelolaDokumenPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [docs, setDocs] = useState<Dokumen[]>([]);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [approvals, setApprovals] = useState<Persetujuan[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [nama, setNama] = useState("");
  const [wajibTtd, setWajibTtd] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [filterDok, setFilterDok] = useState(""); // "" = semua kolom
  const [detail, setDetail] = useState<{ dok: Dokumen; kar: Karyawan; p: Persetujuan | null } | null>(null);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [dRes, kRes, pRes] = await Promise.all([
      supabase.from("dokumen").select("id, nama, file_pdf_url, versi, wajib_ttd, is_aktif, created_at").eq("is_aktif", true).order("created_at"),
      supabase.from("karyawan").select("id, nama").eq("status", "aktif").order("nama"),
      supabase.from("dokumen_persetujuan").select("dokumen_id, dokumen_versi, karyawan_id, tipe, tanda_tangan_url, disetujui_at"),
    ]);
    setDocs((dRes.data as Dokumen[]) ?? []);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setApprovals((pRes.data as Persetujuan[]) ?? []);
    setLoading(false);
  }, []);

  const approvalOf = (dok: Dokumen, kar: Karyawan) =>
    approvals.find((p) => p.dokumen_id === dok.id && p.dokumen_versi === dok.versi && p.karyawan_id === kar.id) ?? null;

  async function uploadPdf(): Promise<string> {
    const safe = nama.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const path = `${safe}_${Date.now()}.pdf`;
    const up = await supabase.storage.from("dokumen").upload(path, file!, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error("Gagal upload PDF: " + up.error.message);
    return supabase.storage.from("dokumen").getPublicUrl(path).data.publicUrl;
  }

  async function simpanBaru() {
    if (!nama.trim() || !file) { setErr("Isi nama & pilih PDF"); return; }
    setErr(""); setBusy(true);
    try {
      const url = await uploadPdf();
      const { error } = await supabase.from("dokumen").insert({
        nama: nama.trim(), file_pdf_url: url, versi: 1, wajib_ttd: wajibTtd,
        is_aktif: true, uploaded_by: user?.nama ?? "",
      });
      if (error) throw new Error(error.message);
      setShowUpload(false); setNama(""); setFile(null); setWajibTtd(true);
      fetchAll();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  async function uploadVersiBaru(dok: Dokumen, f: File) {
    setBusy(true);
    try {
      const path = `${dok.id}_v${dok.versi + 1}_${Date.now()}.pdf`;
      const up = await supabase.storage.from("dokumen").upload(path, f, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const url = supabase.storage.from("dokumen").getPublicUrl(path).data.publicUrl;
      // Versi +1 → persetujuan lama otomatis "belum" (cek pakai versi terbaru)
      await supabase.from("dokumen").update({ file_pdf_url: url, versi: dok.versi + 1, uploaded_by: user?.nama ?? "" }).eq("id", dok.id);
      fetchAll();
    } catch (e) { alert(e instanceof Error ? e.message : "Gagal upload versi baru"); }
    finally { setBusy(false); }
  }

  const kolom = filterDok ? docs.filter((d) => d.id === filterDok) : docs;
  const belumCount = (dok: Dokumen) => karyawan.filter((k) => !approvalOf(dok, k)).length;

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-800">Dokumen & Tanda Tangan</h1>
        </div>
        <button onClick={() => { setShowUpload(true); setErr(""); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={15} /> Upload Dokumen
        </button>
      </div>

      {/* Daftar dokumen + versi baru */}
      <div className="card space-y-2">
        <h2 className="font-semibold text-gray-700 text-sm">Daftar Dokumen ({docs.length})</h2>
        {docs.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">Belum ada dokumen</p>
          : docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-800 truncate">{d.nama}</p>
                <p className="text-[11px] text-gray-400">Versi {d.versi} · {d.wajib_ttd ? "Wajib TTD" : "Baca Saja"} · {belumCount(d)} belum</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.file_pdf_url && <a href={d.file_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">Lihat PDF</a>}
                <label className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer flex items-center gap-1">
                  <Upload size={12} /> Versi Baru
                  <input type="file" accept="application/pdf" className="hidden" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVersiBaru(d, f); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          ))}
      </div>

      {/* Matriks kepatuhan */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-700 text-sm">Matriks Kepatuhan</h2>
          <select className="input py-1.5 text-sm w-auto" value={filterDok} onChange={(e) => setFilterDok(e.target.value)}>
            <option value="">Semua dokumen</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.nama}</option>)}
          </select>
        </div>
        {loading ? <p className="text-sm text-gray-400">Memuat…</p> : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left text-gray-500 font-semibold border-b border-r border-gray-100 min-w-[130px]">Karyawan</th>
                  {kolom.map((d) => (
                    <th key={d.id} className="px-3 py-2 text-center text-gray-500 font-medium border-b border-gray-100 min-w-[120px]">
                      {d.nama} <span className="text-gray-300">v{d.versi}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {karyawan.map((k) => (
                  <tr key={k.id}>
                    <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-medium text-gray-700 border-b border-r border-gray-100 whitespace-nowrap">{k.nama}</td>
                    {kolom.map((d) => {
                      const p = approvalOf(d, k);
                      return (
                        <td key={d.id} className="p-1 border-b border-gray-50 text-center">
                          <button onClick={() => setDetail({ dok: d, kar: k, p })}
                            className={`w-full py-1.5 rounded-md text-xs font-semibold ${p ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                            {p ? <CheckCircle2 size={14} className="inline" /> : <AlertCircle size={14} className="inline" />}
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
      </div>

      {/* Modal upload baru */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Upload Dokumen Baru</h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div>
              <label className="label">Nama Dokumen</label>
              <input className="input" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Perjanjian Kerja" />
            </div>
            <div>
              <label className="label">File PDF</label>
              <input type="file" accept="application/pdf" className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={wajibTtd} onChange={(e) => setWajibTtd(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
              Wajib tanda tangan (jika tidak, cukup dibaca)
            </label>
            {err && <p className="text-sm text-red-500">{err}</p>}
            <button onClick={simpanBaru} disabled={busy} className="btn-primary w-full">{busy ? "Mengunggah…" : "Simpan Dokumen"}</button>
          </div>
        </div>
      )}

      {/* Modal detail cell */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800">{detail.kar.nama}</p>
                <p className="text-xs text-gray-500">{detail.dok.nama} · v{detail.dok.versi}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {detail.p ? (
              <div className="space-y-2 text-sm">
                <p className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 size={15} /> Sudah menyetujui</p>
                <p className="text-gray-600">Tanggal: <b>{tglWaktu(detail.p.disetujui_at)}</b></p>
                <p className="text-gray-600">Tipe: <b>{detail.p.tipe === "ttd" ? "Tanda Tangan" : "Baca Saja"}</b></p>
                {detail.p.tanda_tangan_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Tanda tangan:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.p.tanda_tangan_url} alt="ttd" className="w-full rounded-lg border border-gray-200 bg-white" />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-500 font-semibold flex items-center gap-1"><AlertCircle size={15} /> Belum menyetujui versi ini</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
