"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, Check, RotateCcw, PenLine } from "lucide-react";
import TrainingDocContent, { type TrainingDocValues } from "@/components/TrainingDocContent";

export interface DokPerusahaan { id: string; nama: string; file_pdf_url: string | null; versi: number }

export default function DokumenViewerPerusahaan({ dok, karyawanId, adminNama, onBack, onDone }: {
  dok: DokPerusahaan; karyawanId: string; adminNama: string;
  onBack: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadingIsian, setLoadingIsian] = useState(true);

  const [values, setValues] = useState<TrainingDocValues>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  useEffect(() => {
    (async () => {
      const [pRes, tRes] = await Promise.all([
        supabase.from("dokumen_persetujuan").select("data_isian").eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle(),
        supabase.from("dokumen_ttd_perusahaan").select("data_isian").eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle(),
      ]);
      const karyawan = (pRes.data as { data_isian: TrainingDocValues | null } | null)?.data_isian ?? {};
      const perusahaan = (tRes.data as { data_isian: TrainingDocValues | null } | null)?.data_isian ?? {};
      setValues({ ...karyawan, ...perusahaan });
      setLoadingIsian(false);
    })();
  }, [dok.id, dok.versi, karyawanId]);

  function updateValue(field: keyof TrainingDocValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

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
    if (!values.diwakili_oleh?.trim() || !values.jabatan_perwakilan?.trim()) { setErr("Isi \"Diwakili oleh\" dan \"Jabatan\" dulu"); return; }
    if (!hasSign) { setErr("Tanda tangan dulu"); return; }
    setErr(""); setBusy(true);
    try {
      const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
      const path = `ttd-perusahaan/${karyawanId}/${dok.id}_v${dok.versi}_${Date.now()}.png`;
      const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error("Gagal upload TTD: " + up.error.message);
      const ttdUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;

      const { error } = await supabase.from("dokumen_ttd_perusahaan").upsert({
        dokumen_id: dok.id, dokumen_versi: dok.versi, karyawan_id: karyawanId,
        tanda_tangan_url: ttdUrl, diwakili_oleh: values.diwakili_oleh.trim(), jabatan_perwakilan: values.jabatan_perwakilan.trim(),
        ditandatangani_oleh: adminNama, ditandatangani_at: new Date().toISOString(), data_isian: values,
      }, { onConflict: "dokumen_id,dokumen_versi,karyawan_id" });
      if (error) throw new Error(error.message);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{dok.nama}</p>
          <p className="text-[11px] text-gray-400">Versi {dok.versi} · TTD Pihak Perusahaan</p>
        </div>
      </div>

      <div className="h-[50vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
        {loadingIsian ? <p className="text-sm text-gray-400 py-8 text-center">Memuat dokumen…</p>
          : <TrainingDocContent values={values} mode="perusahaan" onChange={updateValue} />}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1"><PenLine size={13} /> Tanda tangan Pihak Pertama (Perusahaan):</p>
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white">
          <canvas ref={canvasRef} width={600} height={200}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="w-full touch-none rounded-xl" style={{ height: 160 }} />
        </div>
        <button onClick={clearSign} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"><RotateCcw size={12} /> Ulangi</button>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <button onClick={simpan} disabled={busy}
        className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-2">
        <Check size={18} /> {busy ? "Menyimpan…" : "Simpan Tanda Tangan Perusahaan"}
      </button>
    </div>
  );
}
