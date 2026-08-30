"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { FileSignature, Search, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { jalurDariKategori } from "@/lib/aturan";

const DokumenViewerPerusahaan = dynamic(() => import("./DokumenViewerPerusahaan"), { ssr: false });

const KATEGORI_OPTIONS = [
  { value: "", label: "— Belum ditentukan —" },
  { value: "training_produksi", label: "Training Produksi" },
  { value: "training_packing", label: "Training Packing" },
  { value: "staff_produksi", label: "Staff Produksi" },
  { value: "staff_packing", label: "Staff Packing" },
  { value: "spv", label: "SPV" },
];

interface Karyawan { id: string; nama: string; jabatan: string | null; kategori_dokumen: string | null }
interface Dokumen { id: string; nama: string; file_pdf_url: string | null; versi: number; jalur: string | null; jenis: string | null; is_aktif: boolean; konten_html: string | null }
interface PersetujuanKaryawan { dokumen_id: string; dokumen_versi: number; karyawan_id: string; disetujui_at: string }
interface TtdPerusahaan { dokumen_id: string; dokumen_versi: number; karyawan_id: string; ditandatangani_at: string; diwakili_oleh: string | null; jabatan_perwakilan: string | null }

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TtdKaryawanPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [karyawan, setKaryawan] = useState<Karyawan[]>([]);
  const [docs, setDocs] = useState<Dokumen[]>([]);
  const [approvalsKaryawan, setApprovalsKaryawan] = useState<PersetujuanKaryawan[]>([]);
  const [ttdPerusahaan, setTtdPerusahaan] = useState<TtdPerusahaan[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Karyawan | null>(null);
  const [selectedDok, setSelectedDok] = useState<Dokumen | null>(null);
  const [filter, setFilter] = useState<"semua" | "belum_karyawan" | "belum_perusahaan" | "belum_jalur">("semua");
  const [catBusy, setCatBusy] = useState<string | null>(null);

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [kRes, dRes, pRes, tRes] = await Promise.all([
      supabase.from("karyawan").select("id, nama, jabatan, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("dokumen").select("id, nama, file_pdf_url, versi, jalur, jenis, is_aktif, konten_html").eq("is_aktif", true).order("jenis"),
      supabase.from("dokumen_persetujuan").select("dokumen_id, dokumen_versi, karyawan_id, disetujui_at"),
      supabase.from("dokumen_ttd_perusahaan").select("dokumen_id, dokumen_versi, karyawan_id, ditandatangani_at, diwakili_oleh, jabatan_perwakilan"),
    ]);
    setKaryawan((kRes.data as Karyawan[]) ?? []);
    setDocs((dRes.data as Dokumen[]) ?? []);
    setApprovalsKaryawan((pRes.data as PersetujuanKaryawan[]) ?? []);
    setTtdPerusahaan((tRes.data as TtdPerusahaan[]) ?? []);
    setLoading(false);
  }, []);

  async function ubahKategori(k: Karyawan, kategori: string) {
    setCatBusy(k.id);
    await supabase.from("karyawan").update({ kategori_dokumen: kategori || null }).eq("id", k.id);
    await fetchAll();
    setCatBusy(null);
  }

  // Tiap jalur punya 2 dokumen terpisah (PK + PP) — keduanya perlu TTD perusahaan.
  function dokumenUntuk(k: Karyawan): Dokumen[] {
    const j = jalurDariKategori(k.kategori_dokumen);
    if (!j) return [];
    return docs.filter((d) => d.jalur === j);
  }
  function statusKaryawan(k: Karyawan, d: Dokumen) {
    return approvalsKaryawan.find((a) => a.dokumen_id === d.id && a.dokumen_versi === d.versi && a.karyawan_id === k.id) ?? null;
  }
  function statusPerusahaan(k: Karyawan, d: Dokumen) {
    return ttdPerusahaan.find((a) => a.dokumen_id === d.id && a.dokumen_versi === d.versi && a.karyawan_id === k.id) ?? null;
  }

  const cocokFilter = (k: Karyawan) => {
    const dl = dokumenUntuk(k);
    if (filter === "belum_jalur") return !k.kategori_dokumen;
    if (filter === "belum_karyawan") return dl.length > 0 && dl.some((d) => !statusKaryawan(k, d));
    if (filter === "belum_perusahaan") return dl.length > 0 && dl.some((d) => !statusPerusahaan(k, d));
    return true;
  };
  const filtered = karyawan
    .filter((k) => k.nama.toLowerCase().includes(search.toLowerCase()))
    .filter(cocokFilter);

  const FILTER_TAB = [
    { key: "semua" as const,            label: "Semua" },
    { key: "belum_karyawan" as const,   label: "Belum TTD karyawan" },
    { key: "belum_perusahaan" as const, label: "Belum TTD perusahaan" },
    { key: "belum_jalur" as const,      label: "Jalur belum diatur" },
  ];

  if (selected) {
    const dokList = dokumenUntuk(selected);

    // Sudah pilih dokumen → tampilkan viewer TTD perusahaan
    if (selectedDok) {
      return (
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <FileSignature size={20} className="text-amber-500" />
            <h1 className="text-xl font-bold text-gray-800">TTD Dokumen Karyawan</h1>
          </div>
          <div className="card">
            <p className="font-semibold text-gray-800">{selected.nama}</p>
            <p className="text-xs text-gray-500">{selectedDok.nama}</p>
          </div>
          <DokumenViewerPerusahaan
            dok={selectedDok}
            karyawanId={selected.id}
            adminNama={user?.nama ?? ""}
            onBack={() => setSelectedDok(null)}
            onDone={() => { setSelectedDok(null); fetchAll(); }}
          />
        </div>
      );
    }

    // Belum pilih → daftar dokumen (PK & PP) untuk jalur karyawan ini
    return (
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
          <FileSignature size={20} className="text-amber-500" />
          <h1 className="text-xl font-bold text-gray-800">TTD Dokumen Karyawan</h1>
        </div>
        <div className="card">
          <p className="font-semibold text-gray-800">{selected.nama}</p>
          <p className="text-xs text-gray-500">{selected.jabatan ?? "Karyawan"} · Kategori: <b>{selected.kategori_dokumen ?? "belum ditentukan"}</b></p>
        </div>

        {dokList.length === 0 ? (
          <div className="card text-center py-8">
            <AlertCircle size={28} className="mx-auto text-amber-400 mb-2" />
            <p className="text-sm text-gray-500">
              {selected.kategori_dokumen
                ? "Belum ada dokumen aktif untuk jalur karyawan ini. Upload dulu di halaman Dokumen."
                : "Kategori dokumen karyawan ini belum ditentukan. Set kategorinya dulu di daftar."}
            </p>
            <button onClick={() => setSelected(null)} className="mt-3 text-sm text-indigo-600 hover:underline">← Kembali ke daftar</button>
          </div>
        ) : (
          <div className="card space-y-2">
            {dokList.map((d) => {
              const sK = statusKaryawan(selected, d);
              const sP = statusPerusahaan(selected, d);
              return (
                <button key={d.id} onClick={() => setSelectedDok(d)}
                  className="w-full text-left rounded-xl border border-gray-100 p-3 hover:border-amber-200 hover:bg-amber-50/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{d.nama}</p>
                      <p className="text-[11px] text-gray-400">Versi {d.versi}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${sK ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {sK ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />} Karyawan {sK ? tglWaktu(sK.disetujui_at) : "belum TTD"}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${sP ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {sP ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />} Perusahaan {sP ? tglWaktu(sP.ditandatangani_at) : "belum TTD"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <FileSignature size={20} className="text-amber-500" />
        <h1 className="text-xl font-bold text-gray-800">TTD Dokumen Karyawan</h1>
      </div>
      <p className="text-sm text-gray-500">
        Tentukan kategori dokumen tiap karyawan (training/staff/SPV), lalu klik nama untuk tanda tangan sebagai Pihak Pertama (Perusahaan).
      </p>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama karyawan…"
          className="input pl-9" />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TAB.map((f) => {
          const n = karyawan.filter((k) => (f.key === "semua" ? true : (() => {
            const dl = dokumenUntuk(k);
            if (f.key === "belum_jalur") return !k.kategori_dokumen;
            if (f.key === "belum_karyawan") return dl.length > 0 && dl.some((d) => !statusKaryawan(k, d));
            return dl.length > 0 && dl.some((d) => !statusPerusahaan(k, d));
          })())).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f.key ? "bg-gray-800 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {f.label} <span className={filter === f.key ? "text-gray-300" : "text-gray-400"}>({n})</span>
            </button>
          );
        })}
      </div>

      <div className="card space-y-1">
        {loading ? <p className="text-sm text-gray-400 text-center py-4">Memuat…</p>
          : filtered.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Tidak ada karyawan</p>
          : filtered.map((k) => {
            const dokList = dokumenUntuk(k);
            const totalTtdKaryawan = dokList.filter((d) => statusKaryawan(k, d)).length;
            const totalTtdPerusahaan = dokList.filter((d) => statusPerusahaan(k, d)).length;
            return (
              <div key={k.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{k.nama}</p>
                  <p className="text-[11px] text-gray-400">{k.jabatan ?? "Karyawan"}</p>
                  {dokList.length > 0 && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${totalTtdKaryawan === dokList.length ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                        {totalTtdKaryawan === dokList.length ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />} Karyawan {totalTtdKaryawan}/{dokList.length}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${totalTtdPerusahaan === dokList.length ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                        {totalTtdPerusahaan === dokList.length ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />} Perusahaan {totalTtdPerusahaan}/{dokList.length}
                      </span>
                    </div>
                  )}
                </div>
                <select value={k.kategori_dokumen ?? ""} disabled={catBusy === k.id}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => ubahKategori(k, e.target.value)}
                  className="input py-1.5 text-xs w-32 shrink-0">
                  {KATEGORI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => { setSelected(k); setSelectedDok(null); }} className="p-2 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 shrink-0">
                  <ChevronRight size={18} />
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
