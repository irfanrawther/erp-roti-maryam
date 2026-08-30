"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DokumenTerstruktur, { type NilaiField } from "@/components/DokumenTerstruktur";
import { Printer, AlertCircle, Loader2 } from "lucide-react";

interface DokRow { id: string; nama: string; versi: number; konten_html: string | null; jalur: string | null }
interface Persetujuan { dokumen_versi: number; data_isian: NilaiField | null; tanda_tangan_url: string | null; disetujui_at: string }
interface TtdPerusahaan { data_isian: NilaiField | null; tanda_tangan_url: string | null; ditandatangani_at: string; diwakili_oleh: string | null; jabatan_perwakilan: string | null }

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CetakDokumenInner() {
  const params = useSearchParams();
  const dokumenId = params.get("d") ?? "";
  const karyawanId = params.get("k") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dok, setDok] = useState<DokRow | null>(null);
  const [karyawanNama, setKaryawanNama] = useState("");
  const [persetujuan, setPersetujuan] = useState<Persetujuan | null>(null);
  const [perusahaan, setPerusahaan] = useState<TtdPerusahaan | null>(null);
  const [dokVersiTertandatangani, setDokVersiTertandatangani] = useState<DokRow | null>(null);

  useEffect(() => {
    if (!dokumenId || !karyawanId) { setError("Tautan tidak lengkap."); setLoading(false); return; }
    (async () => {
      const [dRes, kRes, pRes] = await Promise.all([
        supabase.from("dokumen").select("id, nama, versi, konten_html, jalur").eq("id", dokumenId).maybeSingle(),
        supabase.from("karyawan").select("nama").eq("id", karyawanId).maybeSingle(),
        supabase.from("dokumen_persetujuan").select("dokumen_versi, data_isian, tanda_tangan_url, disetujui_at")
          .eq("dokumen_id", dokumenId).eq("karyawan_id", karyawanId).maybeSingle(),
      ]);
      const dokRow = dRes.data as DokRow | null;
      const p = pRes.data as Persetujuan | null;
      setDok(dokRow);
      setKaryawanNama((kRes.data as { nama: string } | null)?.nama ?? "");
      setPersetujuan(p);

      if (!p) { setError("Karyawan ini belum menandatangani dokumen ini."); setLoading(false); return; }

      // Isi yang ditampilkan harus persis versi yang ditandatangani. Kalau dokumen
      // sudah direvisi (baris baru), ambil arsip versi lama; kalau versi sekarang
      // masih sama, pakai langsung.
      let dokUntukCetak = dokRow;
      if (dokRow && dokRow.versi !== p.dokumen_versi && dokRow.jalur) {
        const { data: arsip } = await supabase.from("dokumen")
          .select("id, nama, versi, konten_html, jalur")
          .eq("jalur", dokRow.jalur).eq("versi", p.dokumen_versi).maybeSingle();
        dokUntukCetak = (arsip as DokRow | null) ?? dokRow;
      }
      setDokVersiTertandatangani(dokUntukCetak);

      const { data: t } = await supabase.from("dokumen_ttd_perusahaan")
        .select("data_isian, tanda_tangan_url, ditandatangani_at, diwakili_oleh, jabatan_perwakilan")
        .eq("dokumen_id", dokumenId).eq("dokumen_versi", p.dokumen_versi).eq("karyawan_id", karyawanId).maybeSingle();
      setPerusahaan(t as TtdPerusahaan | null);

      setLoading(false);
    })();
  }, [dokumenId, karyawanId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Memuat dokumen…</div>;
  }
  if (error || !dok || !persetujuan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 text-center px-4">
        <AlertCircle className="text-amber-500" size={28} />
        <p className="text-gray-600 text-sm">{error || "Dokumen tidak ditemukan."}</p>
      </div>
    );
  }

  const nilai: NilaiField = {
    nama_lengkap: karyawanNama,
    ...(perusahaan?.data_isian ?? {}),
    ...(perusahaan?.diwakili_oleh ? { diwakili_oleh: perusahaan.diwakili_oleh } : {}),
    ...(perusahaan?.jabatan_perwakilan ? { jabatan_perwakilan: perusahaan.jabatan_perwakilan } : {}),
    ...(persetujuan.data_isian ?? {}),
  };

  const kontenAsli = dokVersiTertandatangani?.konten_html ?? dok.konten_html;
  const versiBeda = dok.versi !== persetujuan.dokumen_versi && dokVersiTertandatangani?.versi !== persetujuan.dokumen_versi;

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-3 print:bg-white print:p-0">
      <div className="max-w-[210mm] mx-auto">
        {/* Toolbar — hilang saat print */}
        <div className="print:hidden flex items-center justify-between mb-4 bg-white rounded-xl shadow-sm px-4 py-3">
          <div className="min-w-0">
            <p className="font-bold text-gray-800 text-sm truncate">{dok.nama}</p>
            <p className="text-[11px] text-gray-400">Versi {persetujuan.dokumen_versi} · {karyawanNama}</p>
          </div>
          <button onClick={() => window.print()}
            className="shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600">
            <Printer size={15} /> Cetak / Simpan PDF
          </button>
        </div>

        {!kontenAsli && (
          <div className="print:hidden flex items-start gap-2 text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5 mb-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            Isi dokumen versi ini belum tersedia untuk dicetak (belum diproses admin).
          </div>
        )}
        {versiBeda && kontenAsli && (
          <div className="print:hidden flex items-start gap-2 text-xs bg-blue-50 text-blue-800 rounded-xl px-3 py-2.5 mb-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            Dokumen sudah direvisi setelah ditandatangani. Isi di bawah adalah versi {persetujuan.dokumen_versi} — persis yang ditandatangani.
          </div>
        )}

        {/* Kertas */}
        <div className="bg-white rounded-xl shadow-sm print:shadow-none print:rounded-none px-8 py-10 print:px-2 print:py-0">
          {kontenAsli && (
            <DokumenTerstruktur html={kontenAsli} nilai={nilai} pemilik="karyawan" readOnly onFields={() => {}} />
          )}

          {/* Blok tanda tangan gambar — pelengkap visual di luar tabel "(...)" bawaan dokumen */}
          <div className="mt-10 grid grid-cols-2 gap-6 break-inside-avoid">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">PIHAK PERTAMA — {perusahaan?.diwakili_oleh || "—"}</p>
              {perusahaan?.tanda_tangan_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perusahaan.tanda_tangan_url} alt="Tanda tangan Pihak Pertama" className="h-24 object-contain" />
              ) : (
                <div className="h-24 flex items-center text-xs text-gray-300 italic">Belum ditandatangani</div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                {perusahaan?.ditandatangani_at ? tglWaktu(perusahaan.ditandatangani_at) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">PIHAK KEDUA — {karyawanNama}</p>
              {persetujuan.tanda_tangan_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={persetujuan.tanda_tangan_url} alt="Tanda tangan Pihak Kedua" className="h-24 object-contain" />
              ) : (
                <div className="h-24 flex items-center text-xs text-gray-300 italic">Belum ditandatangani</div>
              )}
              <p className="text-[11px] text-gray-400 mt-1">{tglWaktu(persetujuan.disetujui_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 14mm 12mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

export default function CetakDokumenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Memuat…</div>}>
      <CetakDokumenInner />
    </Suspense>
  );
}
