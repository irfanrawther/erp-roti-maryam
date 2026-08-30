"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { jalurDariKategori } from "@/lib/aturan";
import { SLOT_DOKUMEN, JALUR_LABEL_DOK, type SlotDokumen } from "@/lib/dokumen";
import { FileText, Upload, X, CheckCircle2, AlertCircle, Archive, RefreshCw, Printer, Pencil, Save } from "lucide-react";
import { fieldDikenalMilik } from "@/lib/dokumenParse";

interface Dokumen {
  id: string; nama: string; file_pdf_url: string | null; versi: number;
  wajib_ttd: boolean; is_aktif: boolean; created_at: string;
  jalur: string | null; jenis: string | null; uploaded_by: string | null;
  konten_html: string | null;
}
interface Karyawan { id: string; nama: string; kategori_dokumen: string | null }
interface Persetujuan {
  dokumen_id: string; dokumen_versi: number; karyawan_id: string; tipe: string;
  tanda_tangan_url: string | null; disetujui_at: string; data_isian: Record<string, string> | null;
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
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState<{ dok: Dokumen; kar: Karyawan; p: Persetujuan | null } | null>(null);
  const [editData, setEditData] = useState(false);
  const [draftIsian, setDraftIsian] = useState<Record<string, string>>({});
  const [savingIsian, setSavingIsian] = useState(false);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [dRes, kRes, pRes] = await Promise.all([
      supabase.from("dokumen").select("id, nama, file_pdf_url, versi, wajib_ttd, is_aktif, jalur, jenis, uploaded_by, konten_html, created_at").order("created_at"),
      supabase.from("karyawan").select("id, nama, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("dokumen_persetujuan").select("dokumen_id, dokumen_versi, karyawan_id, tipe, tanda_tangan_url, disetujui_at, data_isian"),
    ]);
    setDocs((dRes.data as Dokumen[]) ?? []);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setApprovals((pRes.data as Persetujuan[]) ?? []);
    setLoading(false);
  }, []);

  const dokSlot = (s: SlotDokumen) =>
    docs.find((d) => d.is_aktif && d.jalur === s.jalur && d.jenis === s.jenis) ?? null;

  const arsip = docs.filter((d) => !d.is_aktif);

  // Karyawan yang wajib menandatangani slot ini = yang jalurnya cocok
  const karyawanSlot = (s: SlotDokumen) =>
    karyawan.filter((k) => jalurDariKategori(k.kategori_dokumen) === s.jalur);

  const approvalOf = (dok: Dokumen, karId: string) =>
    approvals.find((p) => p.dokumen_id === dok.id && p.dokumen_versi === dok.versi && p.karyawan_id === karId) ?? null;

  // Konversi docx → HTML terstruktur (heading, pasal, tabel tetap utuh).
  async function konversiDocx(f: Blob): Promise<string | null> {
    try {
      const mammoth = await import("mammoth");
      const buf = await f.arrayBuffer();
      const res = await mammoth.convertToHtml({ arrayBuffer: buf });
      return res.value || null;
    } catch { return null; }
  }

  // Untuk file yang sudah diupload sebelum fitur konversi ada.
  // Koreksi field yang sudah ditandatangani (mis. salah ketik Tanggal Mulai
  // Kerja) — tidak butuh tanda tangan ulang, tapi setiap perubahan dicatat
  // ke dokumen_data_edit_log (siapa, kapan, nilai lama → baru).
  async function simpanKoreksiIsian(dok: Dokumen, p: Persetujuan) {
    setSavingIsian(true);
    try {
      const lama = p.data_isian ?? {};
      const perubahan = Object.entries(draftIsian).filter(([k, v]) => (lama[k] ?? "") !== v);
      if (perubahan.length === 0) { setEditData(false); return; }

      const nilaiBaru = { ...lama, ...draftIsian };
      const { error } = await supabase.from("dokumen_persetujuan")
        .update({ data_isian: nilaiBaru })
        .eq("dokumen_id", p.dokumen_id).eq("dokumen_versi", p.dokumen_versi).eq("karyawan_id", p.karyawan_id);
      if (error) throw new Error(error.message);

      await supabase.from("dokumen_data_edit_log").insert(
        perubahan.map(([field_key, nilai_baru]) => ({
          dokumen_id: p.dokumen_id, dokumen_versi: p.dokumen_versi, karyawan_id: p.karyawan_id,
          pemilik: "karyawan", field_key, nilai_lama: lama[field_key] ?? null, nilai_baru,
          diedit_oleh: user?.nama ?? "",
        }))
      );

      await fetchAll();
      setEditData(false);
      setDetail((d) => (d && d.p) ? { ...d, p: { ...d.p, data_isian: nilaiBaru } } : d);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan koreksi"); }
    finally { setSavingIsian(false); }
  }

  async function prosesUlang(d: Dokumen) {
    if (!d.file_pdf_url) return;
    setBusy(`re-${d.id}`); setErr("");
    try {
      const r = await fetch(d.file_pdf_url);
      if (!r.ok) throw new Error("Gagal mengunduh file dari Storage.");
      const blob = await r.blob();
      const html = await konversiDocx(blob);
      if (!html) throw new Error("Gagal membaca isi file. Hanya .docx yang bisa dirender terstruktur.");
      const { error } = await supabase.from("dokumen")
        .update({ konten_html: html, konten_html_at: new Date().toISOString() }).eq("id", d.id);
      if (error) throw new Error(error.message);
      await fetchAll();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal memproses"); }
    finally { setBusy(null); }
  }

  async function uploadSlot(s: SlotDokumen, f: File) {
    const key = `${s.jalur}-${s.jenis}`;
    setBusy(key); setErr("");
    try {
      const ext = f.name.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
      // docx dikonversi jadi HTML terstruktur sekali di sini, supaya halaman
      // karyawan tinggal merender (cepat dibuka dari HP).
      let html: string | null = null;
      if (ext === "docx") {
        html = await konversiDocx(f);
        if (!html) throw new Error("Gagal membaca isi docx. Pastikan file .docx valid (bukan .doc lama).");
      }
      const path = `${s.jalur}_${s.jenis}_${Date.now()}.${ext}`;
      const up = await supabase.storage.from("dokumen").upload(path, f, { contentType: f.type || "application/pdf", upsert: true });
      if (up.error) throw new Error("Gagal upload: " + up.error.message);
      const url = supabase.storage.from("dokumen").getPublicUrl(path).data.publicUrl;

      const existing = dokSlot(s);
      if (existing) {
        // Versi baru = BARIS BARU (id baru), bukan update di tempat — supaya
        // tanda tangan yang sudah ada (menunjuk dokumen_id + dokumen_versi lama)
        // tetap bisa mengambil isi & file versi lama itu untuk dicetak/dibaca,
        // bukan cuma nomor versinya saja. Baris lama diarsipkan (is_aktif=false).
        const { error: archErr } = await supabase.from("dokumen")
          .update({ is_aktif: false }).eq("id", existing.id);
        if (archErr) throw new Error(archErr.message);
        const { error } = await supabase.from("dokumen").insert({
          nama: s.nama, file_pdf_url: url, versi: existing.versi + 1, wajib_ttd: true, is_aktif: true,
          jalur: s.jalur, jenis: s.jenis, kategori: s.jalur, uploaded_by: user?.nama ?? "",
          konten_html: html, konten_html_at: html ? new Date().toISOString() : null,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("dokumen").insert({
          nama: s.nama, file_pdf_url: url, versi: 1, wajib_ttd: true, is_aktif: true,
          jalur: s.jalur, jenis: s.jenis, kategori: s.jalur, uploaded_by: user?.nama ?? "",
          konten_html: html, konten_html_at: html ? new Date().toISOString() : null,
        });
        if (error) throw new Error(error.message);
      }
      await fetchAll();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(null); }
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <FileText size={20} className="text-indigo-500" />
        <h1 className="text-xl font-bold text-gray-800">Dokumen & Tanda Tangan</h1>
      </div>
      <p className="text-sm text-gray-500">
        Enam slot dokumen, masing-masing ditandatangani terpisah. Upload file baru pada satu slot
        otomatis menaikkan versinya; tanda tangan yang sudah ada tetap menunjuk ke versi yang
        ditandatangani saat itu.
      </p>

      {err && <div className="flex items-center gap-2 text-sm bg-red-50 text-red-600 rounded-xl px-3 py-2"><AlertCircle size={15} /> {err}</div>}

      {loading ? <p className="text-sm text-gray-400 text-center py-8">Memuat…</p> : (
        <>
          {(["training", "staff", "spv"] as const).map((jalur) => (
            <div key={jalur} className="card space-y-2">
              <h2 className="font-semibold text-gray-700 text-sm">{JALUR_LABEL_DOK[jalur]}</h2>
              {SLOT_DOKUMEN.filter((s) => s.jalur === jalur).map((s) => {
                const d = dokSlot(s);
                const key = `${s.jalur}-${s.jenis}`;
                const wajib = karyawanSlot(s);
                const sudah = d ? wajib.filter((k) => approvalOf(d, k.id)).length : 0;
                return (
                  <div key={key} className={`rounded-xl border p-3 ${d ? "border-gray-100" : "border-dashed border-amber-200 bg-amber-50/40"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{s.nama}</p>
                        {d ? (
                          <p className="text-[11px] text-gray-400">
                            Versi {d.versi} · {sudah}/{wajib.length} karyawan sudah TTD
                            {d.uploaded_by && <> · diupload {d.uploaded_by}</>}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-700 font-medium">Belum ada file — slot kosong</p>
                        )}
                        {d && (
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${d.konten_html ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            {d.konten_html ? "Isi siap ditandatangani" : "Isi belum diproses — klik \"Proses isi\""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d && !d.konten_html && (
                          <button onClick={() => prosesUlang(d)} disabled={busy !== null}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1 disabled:opacity-40">
                            <RefreshCw size={12} /> {busy === `re-${d.id}` ? "Memproses…" : "Proses isi"}
                          </button>
                        )}
                        {d?.file_pdf_url && (
                          <a href={d.file_pdf_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline">Lihat file</a>
                        )}
                        <label className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 ${d ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}>
                          <Upload size={12} /> {busy === key ? "Mengunggah…" : d ? "Versi Baru" : "Upload"}
                          <input type="file" accept="application/pdf,.docx" className="hidden" disabled={busy !== null}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSlot(s, f); e.target.value = ""; }} />
                        </label>
                      </div>
                    </div>

                    {d && wajib.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {wajib.map((k) => {
                          const p = approvalOf(d, k.id);
                          return (
                            <button key={k.id} onClick={() => { setDetail({ dok: d, kar: k, p }); setEditData(false); setDraftIsian({}); }}
                              className={`text-[10px] px-2 py-1 rounded-full font-medium flex items-center gap-1 ${p ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-red-50 text-red-500 hover:bg-red-100"}`}>
                              {p ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />} {k.nama}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {d && wajib.length === 0 && (
                      <p className="text-[11px] text-gray-400 mt-2">Belum ada karyawan yang di-assign ke jalur ini.</p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {arsip.length > 0 && (
            <div className="card space-y-2">
              <h2 className="font-semibold text-gray-500 text-sm flex items-center gap-1.5"><Archive size={14} /> Arsip (tidak aktif)</h2>
              {arsip.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-600 truncate">{d.nama}</p>
                    <p className="text-[10px] text-gray-400">Versi {d.versi} · {tglWaktu(d.created_at)}</p>
                  </div>
                  {d.file_pdf_url && <a href={d.file_pdf_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline shrink-0">Lihat</a>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
                <a href={`/cetak-dokumen?d=${detail.dok.id}&k=${detail.kar.id}`} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600">
                  <Printer size={14} /> Unduh / Cetak Dokumen
                </a>

                {!editData ? (
                  <button onClick={() => { setDraftIsian(detail.p!.data_isian ?? {}); setEditData(true); }}
                    className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200">
                    <Pencil size={14} /> Koreksi Data yang Sudah Diisi
                  </button>
                ) : (
                  <div className="space-y-2 border-t border-gray-100 pt-3 mt-1">
                    <p className="text-xs font-semibold text-gray-600">Koreksi field — dokumen tetap sah, tidak perlu TTD ulang</p>
                    {fieldDikenalMilik("karyawan").map((f) => (
                      <div key={f.key}>
                        <label className="text-[11px] text-gray-500">{f.label}</label>
                        <input
                          type={f.tipe === "date" ? "date" : f.tipe === "tel" ? "tel" : "text"}
                          value={draftIsian[f.key] ?? ""}
                          onChange={(e) => setDraftIsian((d) => ({ ...d, [f.key]: e.target.value }))}
                          className="input py-1.5 text-sm w-full"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditData(false)}
                        className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                        Batal
                      </button>
                      <button onClick={() => simpanKoreksiIsian(detail.dok, detail.p!)} disabled={savingIsian}
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                        <Save size={14} /> {savingIsian ? "Menyimpan…" : "Simpan"}
                      </button>
                    </div>
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
