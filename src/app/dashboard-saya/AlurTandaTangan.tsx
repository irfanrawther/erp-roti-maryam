"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import DokumenTerstruktur, { type NilaiField } from "@/components/DokumenTerstruktur";
import { fieldMilik, type DefinisiField } from "@/lib/dokumenParse";
import { ChevronLeft, Check, RotateCcw, PenLine, AlertCircle, CheckCircle2, FileText } from "lucide-react";

export interface DokTtd {
  id: string; nama: string; versi: number; wajib_ttd: boolean;
  file_pdf_url: string | null; konten_html: string | null;
  approved: { disetujui_at: string; tipe: string; tanda_tangan_url: string | null; data_isian: NilaiField | null } | null;
}

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Alur tanda tangan berurutan: Perjanjian Kerja dulu, lalu Peraturan
 * Perusahaan. Field yang sama (nama, NIK, dll) dibawa ke dokumen kedua
 * supaya karyawan tidak mengetik dua kali, tapi tetap disimpan sebagai
 * dua tanda tangan terpisah dengan versi dokumennya masing-masing.
 */
export default function AlurTandaTangan({ docs, karyawanId, karyawanNama, onBack, onDone }: {
  docs: DokTtd[]; karyawanId: string; karyawanNama: string;
  onBack: () => void; onDone: () => void;
}) {
  // Mulai dari dokumen pertama yang belum ditandatangani
  const idxAwal = Math.max(0, docs.findIndex((d) => !d.approved));
  const [idx, setIdx] = useState(idxAwal === -1 ? 0 : idxAwal);
  const dok = docs[idx];
  const sudah = !!dok?.approved;

  const [nilai, setNilai] = useState<NilaiField>({});
  const [fields, setFields] = useState<DefinisiField[]>([]);
  const [scrollDone, setScrollDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  // Prefill: nilai dari dokumen sebelumnya + isian perusahaan + data yang sudah tersimpan
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dok) return;
      const { data } = await supabase.from("dokumen_ttd_perusahaan")
        .select("data_isian, diwakili_oleh, jabatan_perwakilan")
        .eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle();
      if (!alive) return;
      const p = data as { data_isian: NilaiField | null; diwakili_oleh: string | null; jabatan_perwakilan: string | null } | null;
      const dariPerusahaan: NilaiField = {
        ...(p?.data_isian ?? {}),
        ...(p?.diwakili_oleh ? { diwakili_oleh: p.diwakili_oleh } : {}),
        ...(p?.jabatan_perwakilan ? { jabatan_perwakilan: p.jabatan_perwakilan } : {}),
      };
      // Sudah TTD → tampilkan apa adanya. Belum → bawa isian sebelumnya.
      const dasar = dok.approved?.data_isian ?? {};
      setNilai((prev) => ({
        nama_lengkap: karyawanNama,
        ...dariPerusahaan,
        ...(sudah ? dasar : { ...prev, ...dasar }),
      }));
      setScrollDone(false); setHasSign(false); setErr("");
      const c = canvasRef.current;
      if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    })();
    return () => { alive = false; };
  }, [idx, dok?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) setScrollDone(true);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 60) setScrollDone(true);
  }, [dok?.id, fields.length]);

  // ── Signature pad ──
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

  const wajibKaryawan = fieldMilik(fields, "karyawan").filter((f) => f.wajib);
  const belumTerisi = wajibKaryawan.filter((f) => !(nilai[f.key] ?? "").trim());

  async function simpan() {
    if (!dok) return;
    setErr("");
    if (belumTerisi.length > 0) {
      setErr(`Masih ada field kosong: ${belumTerisi.map((f) => f.label).join(", ")}`);
      return;
    }
    if (dok.wajib_ttd && !hasSign) { setErr("Tanda tangan dulu di kotak bawah."); return; }
    setBusy(true);
    try {
      let ttdUrl: string | null = null;
      if (dok.wajib_ttd) {
        const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
        // Gambar TTD disimpan sebagai file di Storage — bukan base64 di database.
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

      if (idx < docs.length - 1) { setIdx(idx + 1); }
      else { onDone(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  if (!dok) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
        <FileText size={26} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">Belum ada dokumen untuk jalur kamu.</p>
        <button onClick={onBack} className="mt-3 text-sm text-indigo-600 hover:underline">← Kembali</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 shrink-0"><ChevronLeft size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-800 text-sm leading-tight">{dok.nama}</p>
          <p className="text-[11px] text-gray-400">Versi {dok.versi} · Dokumen {idx + 1} dari {docs.length}</p>
        </div>
      </div>

      {/* Progres */}
      <div className="flex gap-1.5">
        {docs.map((d, i) => (
          <div key={d.id} className={`h-1.5 flex-1 rounded-full ${
            d.approved ? "bg-green-400" : i === idx ? "bg-indigo-400" : "bg-gray-200"
          }`} />
        ))}
      </div>

      {sudah && (
        <div className="flex items-start gap-2 text-xs bg-green-50 text-green-700 rounded-xl px-3 py-2">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <span>Sudah kamu tandatangani pada {tglWaktu(dok.approved!.disetujui_at)}. Dokumen ini hanya bisa dibaca.</span>
        </div>
      )}

      {!dok.konten_html ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <AlertCircle size={22} className="mx-auto text-amber-500 mb-1.5" />
          <p className="text-sm text-amber-800">Isi dokumen belum diproses oleh admin.</p>
          {dok.file_pdf_url && (
            <a href={dok.file_pdf_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline mt-1 inline-block">Buka file aslinya</a>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll}
            className="h-[55vh] overflow-y-auto rounded-xl border border-gray-200 bg-white px-3 py-2">
            <DokumenTerstruktur
              html={dok.konten_html}
              nilai={nilai}
              pemilik="karyawan"
              readOnly={sudah}
              onChange={(k, v) => setNilai((n) => ({ ...n, [k]: v }))}
              onFields={(f) => setFields(f)}
            />
          </div>

          {!sudah && !scrollDone && (
            <p className="text-xs text-amber-600 text-center">↓ Gulir sampai bawah untuk membuka tanda tangan</p>
          )}

          {!sudah && scrollDone && belumTerisi.length > 0 && (
            <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Masih kosong: <b>{belumTerisi.map((f) => f.label).join(", ")}</b></span>
            </div>
          )}

          {sudah && dok.approved?.tanda_tangan_url && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Tanda tangan kamu:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dok.approved.tanda_tangan_url} alt="tanda tangan" className="w-full rounded-xl border border-gray-200 bg-white" />
            </div>
          )}

          {!sudah && scrollDone && dok.wajib_ttd && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1"><PenLine size={13} /> Tanda tangan kamu:</p>
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white">
                <canvas ref={canvasRef} width={600} height={200}
                  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
                  className="w-full touch-none rounded-xl" style={{ height: 160 }} />
              </div>
              <button onClick={hapusTtd} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
                <RotateCcw size={12} /> Hapus & ulangi
              </button>
            </div>
          )}
        </>
      )}

      {err && <p className="text-sm text-red-500">{err}</p>}

      {sudah ? (
        idx < docs.length - 1 ? (
          <button onClick={() => setIdx(idx + 1)}
            className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600">
            Lanjut ke dokumen berikutnya →
          </button>
        ) : (
          <button onClick={onBack} className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200">
            Selesai
          </button>
        )
      ) : scrollDone && dok.konten_html ? (
        <button onClick={simpan} disabled={busy || (dok.wajib_ttd && !hasSign) || belumTerisi.length > 0}
          className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center gap-2">
          <Check size={18} />
          {busy ? "Menyimpan…" : idx < docs.length - 1 ? "Setuju & Tanda Tangan — lanjut" : "Setuju & Tanda Tangan — selesai"}
        </button>
      ) : null}
    </div>
  );
}
