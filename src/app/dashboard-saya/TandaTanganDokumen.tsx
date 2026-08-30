"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import DokumenTerstruktur, { type NilaiField } from "@/components/DokumenTerstruktur";
import { fieldMilik, type DefinisiField } from "@/lib/dokumenParse";
import { ChevronLeft, Check, RotateCcw, PenLine, AlertCircle, CheckCircle2, Eye, Download, Printer } from "lucide-react";

export interface DokTtd {
  id: string; nama: string; versi: number; wajib_ttd: boolean;
  file_pdf_url: string | null; konten_html: string | null;
  approved: { disetujui_at: string; tipe: string; tanda_tangan_url: string | null; data_isian: NilaiField | null } | null;
}

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Satu dokumen, dua mode:
 *  - "baca" : hanya membaca, tanpa area tanda tangan
 *  - "ttd"  : isi field Pihak Kedua + tanda tangan
 * Field Pihak Pertama (Diwakili oleh / Jabatan) tampil read-only —
 * itu diisi Super Admin dari panelnya sendiri.
 */
export default function TandaTanganDokumen({
  dok, karyawanId, karyawanNama, modeAwal, onBack, onDone,
}: {
  dok: DokTtd; karyawanId: string; karyawanNama: string;
  modeAwal: "baca" | "ttd";
  onBack: () => void; onDone: () => void;
}) {
  const sudah = !!dok.approved;
  const [mode, setMode] = useState<"baca" | "ttd">(sudah ? "baca" : modeAwal);

  const [nilai, setNilai] = useState<NilaiField>({});
  const [fields, setFields] = useState<DefinisiField[]>([]);
  const [siapTtd, setSiapTtd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("dokumen_ttd_perusahaan")
        .select("data_isian, diwakili_oleh, jabatan_perwakilan")
        .eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle();
      if (!alive) return;
      const p = data as { data_isian: NilaiField | null; diwakili_oleh: string | null; jabatan_perwakilan: string | null } | null;
      setNilai({
        nama_lengkap: karyawanNama,
        ...(p?.data_isian ?? {}),
        ...(p?.diwakili_oleh ? { diwakili_oleh: p.diwakili_oleh } : {}),
        ...(p?.jabatan_perwakilan ? { jabatan_perwakilan: p.jabatan_perwakilan } : {}),
        ...(dok.approved?.data_isian ?? {}),
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [dok.id, dok.versi, karyawanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) setSiapTtd(true);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 60) setSiapTtd(true);
  }, [loading, mode]);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e: React.PointerEvent) {
    e.preventDefault(); drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1e293b";
    const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); setHasSign(true);
  }
  function up() { drawing.current = false; }
  function hapusTtd() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasSign(false);
  }

  const wajib = fieldMilik(fields, "karyawan").filter((f) => f.wajib);
  const belumTerisi = wajib.filter((f) => !(nilai[f.key] ?? "").trim());
  const perusahaanBelum = fieldMilik(fields, "perusahaan").filter((f) => !(nilai[f.key] ?? "").trim());

  async function simpan() {
    setErr("");
    if (belumTerisi.length > 0) { setErr(`Masih ada yang kosong: ${belumTerisi.map((f) => f.label).join(", ")}`); return; }
    if (dok.wajib_ttd && !hasSign) { setErr("Tanda tangan dulu di kotak bawah."); return; }
    setBusy(true);
    try {
      let ttdUrl: string | null = null;
      if (dok.wajib_ttd) {
        const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
        const path = `ttd/${karyawanId}/${dok.id}_v${dok.versi}_${Date.now()}.png`;
        const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error("Gagal upload tanda tangan: " + up.error.message);
        ttdUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("dokumen_persetujuan").upsert({
        dokumen_id: dok.id, dokumen_versi: dok.versi, karyawan_id: karyawanId,
        tipe: dok.wajib_ttd ? "ttd" : "baca_saja", tanda_tangan_url: ttdUrl,
        scroll_selesai: true, disetujui_at: new Date().toISOString(), data_isian: nilai,
      }, { onConflict: "dokumen_id,dokumen_versi,karyawan_id" });
      if (error) throw new Error(error.message);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-2">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 shrink-0 -ml-1 mt-0.5">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-800 text-sm leading-snug">{dok.nama}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Versi {dok.versi}</span>
              {sudah ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-0.5">
                  <CheckCircle2 size={10} /> Sudah ditandatangani
                </span>
              ) : mode === "baca" ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center gap-0.5">
                  <Eye size={10} /> Mode baca
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center gap-0.5">
                  <PenLine size={10} /> Sedang diisi
                </span>
              )}
            </div>
          </div>
        </div>

        {sudah && (
          <p className="text-[11px] text-gray-500 mt-2 pl-6">
            Ditandatangani {tglWaktu(dok.approved!.disetujui_at)}
          </p>
        )}
      </div>

      {/* Isi dokumen */}
      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Memuat dokumen…</p>
      ) : !dok.konten_html ? (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <AlertCircle size={22} className="mx-auto text-amber-500 mb-1.5" />
          <p className="text-sm text-amber-800">Isi dokumen belum diproses admin.</p>
          {dok.file_pdf_url && (
            <a href={dok.file_pdf_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline mt-1 inline-flex items-center gap-1">
              <Download size={11} /> Unduh file aslinya
            </a>
          )}
        </div>
      ) : (
        <>
          {mode === "ttd" && perusahaanBelum.length > 0 && (
            <div className="mx-4 mt-3 flex items-start gap-2 text-[11px] bg-blue-50 text-blue-800 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Bagian <b>Pihak Pertama</b> ({perusahaanBelum.map((f) => f.label).join(", ")}) diisi oleh admin, bukan kamu.</span>
            </div>
          )}

          <div ref={scrollRef} onScroll={onScroll}
            className="max-h-[58vh] overflow-y-auto px-4 py-3 bg-gray-50/40">
            <div className="bg-white rounded-xl border border-gray-200 px-3.5 py-4 shadow-sm">
              <DokumenTerstruktur
                html={dok.konten_html}
                nilai={nilai}
                pemilik="karyawan"
                readOnly={mode === "baca"}
                onChange={(k, v) => setNilai((n) => ({ ...n, [k]: v }))}
                onFields={(f) => setFields(f)}
              />
            </div>

            {sudah && dok.approved?.tanda_tangan_url && (
              <div className="mt-3 bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Tanda tangan kamu</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dok.approved.tanda_tangan_url} alt="tanda tangan" className="w-full max-w-xs rounded-lg border border-gray-100" />
              </div>
            )}

            {mode === "ttd" && dok.wajib_ttd && (
              <div className="mt-3 bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1"><PenLine size={13} /> Tanda tangan kamu di sini</p>
                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30">
                  <canvas ref={canvasRef} width={600} height={200}
                    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
                    className="w-full touch-none rounded-xl" style={{ height: 150 }} />
                </div>
                <button onClick={hapusTtd} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
                  <RotateCcw size={12} /> Hapus & ulangi
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Aksi */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-2">
        {err && <p className="text-sm text-red-500">{err}</p>}

        {mode === "ttd" && !sudah && belumTerisi.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
            Masih kosong: <b>{belumTerisi.map((f) => f.label).join(", ")}</b>
          </p>
        )}

        {sudah ? (
          <div className="space-y-2">
            <a href={`/cetak-dokumen?d=${dok.id}&k=${karyawanId}`} target="_blank" rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-600 flex items-center justify-center gap-1.5">
              <Printer size={15} /> Unduh / Cetak Dokumen
            </a>
            <button onClick={onBack} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">
              Kembali
            </button>
          </div>
        ) : mode === "baca" ? (
          <button onClick={() => { setMode("ttd"); setSiapTtd(false); scrollRef.current?.scrollTo({ top: 0 }); }}
            disabled={!dok.konten_html}
            className="w-full py-2.5 rounded-xl bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center gap-1.5">
            <PenLine size={15} /> Isi & tanda tangani dokumen ini
          </button>
        ) : (
          <>
            {!siapTtd && <p className="text-[11px] text-amber-600 text-center">↓ Gulir sampai bawah dulu</p>}
            <button onClick={simpan}
              disabled={busy || !siapTtd || belumTerisi.length > 0 || (dok.wajib_ttd && !hasSign)}
              className="w-full py-2.5 rounded-xl bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center gap-1.5">
              <Check size={16} /> {busy ? "Menyimpan…" : "Setuju & Simpan Tanda Tangan"}
            </button>
            <button onClick={() => setMode("baca")} className="w-full py-2 text-xs text-gray-500 hover:text-gray-700">
              Kembali ke mode baca
            </button>
          </>
        )}
      </div>
    </div>
  );
}
