"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import DokumenTerstruktur, { type NilaiField } from "@/components/DokumenTerstruktur";
import { fieldMilik, type DefinisiField } from "@/lib/dokumenParse";
import { ChevronLeft, Check, RotateCcw, PenLine, AlertCircle, CheckCircle2 } from "lucide-react";

export interface DokPerusahaan {
  id: string; nama: string; file_pdf_url: string | null; versi: number; konten_html: string | null;
}

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DokumenViewerPerusahaan({ dok, karyawanId, adminNama, onBack, onDone }: {
  dok: DokPerusahaan; karyawanId: string; adminNama: string;
  onBack: () => void; onDone: () => void;
}) {
  const [nilai, setNilai] = useState<NilaiField>({});
  const [fields, setFields] = useState<DefinisiField[]>([]);
  const [sudah, setSudah] = useState<{ ditandatangani_at: string; tanda_tangan_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasSign, setHasSign] = useState(false);

  useEffect(() => {
    (async () => {
      const [tRes, pRes] = await Promise.all([
        supabase.from("dokumen_ttd_perusahaan")
          .select("data_isian, diwakili_oleh, jabatan_perwakilan, ditandatangani_at, tanda_tangan_url")
          .eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle(),
        supabase.from("dokumen_persetujuan")
          .select("data_isian")
          .eq("dokumen_id", dok.id).eq("dokumen_versi", dok.versi).eq("karyawan_id", karyawanId).maybeSingle(),
      ]);
      const t = tRes.data as { data_isian: NilaiField | null; diwakili_oleh: string | null; jabatan_perwakilan: string | null; ditandatangani_at: string; tanda_tangan_url: string | null } | null;
      const p = pRes.data as { data_isian: NilaiField | null } | null;
      setNilai({
        ...(p?.data_isian ?? {}),            // isian karyawan (read-only di sini)
        ...(t?.data_isian ?? {}),
        ...(t?.diwakili_oleh ? { diwakili_oleh: t.diwakili_oleh } : {}),
        ...(t?.jabatan_perwakilan ? { jabatan_perwakilan: t.jabatan_perwakilan } : {}),
      });
      if (t?.ditandatangani_at) setSudah({ ditandatangani_at: t.ditandatangani_at, tanda_tangan_url: t.tanda_tangan_url });
      setLoading(false);
    })();
  }, [dok.id, dok.versi, karyawanId]);

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

  const wajib = fieldMilik(fields, "perusahaan").filter((f) => f.wajib);
  const belumTerisi = wajib.filter((f) => !(nilai[f.key] ?? "").trim());

  async function simpan() {
    setErr("");
    if (belumTerisi.length > 0) { setErr(`Masih kosong: ${belumTerisi.map((f) => f.label).join(", ")}`); return; }
    if (!hasSign) { setErr("Tanda tangan dulu."); return; }
    setBusy(true);
    try {
      const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png"));
      const path = `ttd-perusahaan/${karyawanId}/${dok.id}_v${dok.versi}_${Date.now()}.png`;
      const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/png", upsert: true });
      if (up.error) throw new Error("Gagal upload TTD: " + up.error.message);
      const ttdUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;

      const { error } = await supabase.from("dokumen_ttd_perusahaan").upsert({
        dokumen_id: dok.id, dokumen_versi: dok.versi, karyawan_id: karyawanId,
        tanda_tangan_url: ttdUrl,
        diwakili_oleh: (nilai.diwakili_oleh ?? "").trim(),
        jabatan_perwakilan: (nilai.jabatan_perwakilan ?? "").trim(),
        ditandatangani_oleh: adminNama, ditandatangani_at: new Date().toISOString(), data_isian: nilai,
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

      {sudah && (
        <div className="flex items-start gap-2 text-xs bg-green-50 text-green-700 rounded-xl px-3 py-2">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <span>Sudah ditandatangani perusahaan pada {tglWaktu(sudah.ditandatangani_at)}. Menyimpan lagi akan menggantikannya.</span>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400 py-6 text-center">Memuat…</p>
        : !dok.konten_html ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <AlertCircle size={22} className="mx-auto text-amber-500 mb-1.5" />
            <p className="text-sm text-amber-800">
              Isi dokumen belum diproses. Buka halaman <b>Dokumen</b> lalu klik &quot;Proses isi&quot; pada slot ini.
            </p>
          </div>
        ) : (
          <div className="h-[50vh] overflow-y-auto rounded-xl border border-gray-200 bg-white px-3 py-2">
            <DokumenTerstruktur
              html={dok.konten_html}
              nilai={nilai}
              pemilik="perusahaan"
              onChange={(k, v) => setNilai((n) => ({ ...n, [k]: v }))}
              onFields={(f) => setFields(f)}
            />
          </div>
        )}

      {dok.konten_html && (
        <>
          {belumTerisi.length > 0 && (
            <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Masih kosong: <b>{belumTerisi.map((f) => f.label).join(", ")}</b> — isi langsung di dokumen di atas.</span>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1"><PenLine size={13} /> Tanda tangan Pihak Pertama (Perusahaan):</p>
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white">
              <canvas ref={canvasRef} width={600} height={200}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
                className="w-full touch-none rounded-xl" style={{ height: 160 }} />
            </div>
            <button onClick={hapusTtd} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
              <RotateCcw size={12} /> Hapus & ulangi
            </button>
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <button onClick={simpan} disabled={busy || !hasSign || belumTerisi.length > 0}
            className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-2">
            <Check size={18} /> {busy ? "Menyimpan…" : "Simpan Tanda Tangan Perusahaan"}
          </button>
        </>
      )}
    </div>
  );
}
