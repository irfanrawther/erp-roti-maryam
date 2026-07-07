"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, Check, RotateCcw, PenLine } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export interface Dok {
  id: string; nama: string; file_pdf_url: string | null; versi: number; wajib_ttd: boolean;
}

export default function DokumenViewer({ dok, karyawanId, onBack, onDone }: {
  dok: Dok; karyawanId: string; onBack: () => void; onDone: () => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [scrollDone, setScrollDone] = useState(false);
  const [width, setWidth] = useState(340);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Tanda tangan
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const set = () => setWidth(Math.min(el.clientWidth - 24, 800));
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrollDone(true);
  }, []);

  // Jika dokumen pendek (tak perlu scroll) → anggap selesai
  function afterRender() {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 40) setScrollDone(true);
  }

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
  function clearSign() {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasSign(false);
  }

  async function simpan() {
    if (!dok.file_pdf_url) return;
    setErr(""); setBusy(true);
    try {
      let ttdUrl: string | null = null;
      if (dok.wajib_ttd) {
        if (!hasSign) { setErr("Tanda tangan dulu"); setBusy(false); return; }
        const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
        const path = `ttd/${karyawanId}/${dok.id}_v${dok.versi}_${Date.now()}.png`;
        const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error("Gagal upload TTD: " + up.error.message);
        ttdUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("dokumen_persetujuan").upsert({
        dokumen_id: dok.id, dokumen_versi: dok.versi, karyawan_id: karyawanId,
        tipe: dok.wajib_ttd ? "ttd" : "baca_saja", tanda_tangan_url: ttdUrl,
        scroll_selesai: true, disetujui_at: new Date().toISOString(),
      }, { onConflict: "dokumen_id,dokumen_versi,karyawan_id" });
      if (error) throw new Error(error.message);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  return (
    <div ref={wrapRef} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{dok.nama}</p>
          <p className="text-[11px] text-gray-400">Versi {dok.versi} · {dok.wajib_ttd ? "Wajib TTD" : "Baca Saja"}</p>
        </div>
      </div>

      {/* PDF scroll area */}
      <div ref={scrollRef} onScroll={onScroll}
        className="h-[55vh] overflow-y-auto rounded-xl border border-gray-200 bg-gray-100 flex flex-col items-center py-2">
        {dok.file_pdf_url ? (
          <Document file={dok.file_pdf_url} onLoadSuccess={({ numPages }) => { setNumPages(numPages); setTimeout(afterRender, 300); }}
            loading={<p className="text-sm text-gray-400 py-8">Memuat dokumen…</p>}
            error={<p className="text-sm text-red-500 py-8">Gagal memuat PDF</p>}>
            {Array.from({ length: numPages }, (_, i) => (
              <Page key={i} pageNumber={i + 1} width={width} className="mb-2 shadow" renderTextLayer={false} renderAnnotationLayer={false}
                onRenderSuccess={i + 1 === numPages ? afterRender : undefined} />
            ))}
          </Document>
        ) : <p className="text-sm text-gray-400 py-8">PDF belum tersedia</p>}
      </div>

      {!scrollDone && (
        <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
          ↓ Scroll sampai halaman terakhir untuk membuka tombol persetujuan
        </p>
      )}

      {/* Setelah scroll selesai */}
      {scrollDone && dok.wajib_ttd && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1"><PenLine size={13} /> Tanda tangan di bawah:</p>
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white">
            <canvas ref={canvasRef} width={600} height={200}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              className="w-full touch-none rounded-xl" style={{ height: 160 }} />
          </div>
          <button onClick={clearSign} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"><RotateCcw size={12} /> Ulangi</button>
        </div>
      )}

      {err && <p className="text-sm text-red-500">{err}</p>}

      {scrollDone && (
        <button onClick={simpan} disabled={busy || (dok.wajib_ttd && !hasSign)}
          className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center gap-2">
          <Check size={18} /> {busy ? "Menyimpan…" : (dok.wajib_ttd ? "Setuju & Tanda Tangan" : "Saya Sudah Baca")}
        </button>
      )}
    </div>
  );
}
