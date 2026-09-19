import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, CheckCircle2, XCircle, Camera } from "lucide-react";

interface SesiRow {
  id: string; tanggal_tugas: string; sesi: "pagi" | "malam"; status: string;
  mulai_at: string; selesai_at: string | null;
  auditor: { nama: string } | null;
}
interface HasilRow {
  id: string; sesi_id: string; jenis_audit_snapshot: string | null; area_label_snapshot: string | null;
  nama_tugas_snapshot: string | null; status: "lulus" | "gagal";
  penanggung_jawab_tipe: string | null; karyawan_id: string | null;
  catatan: string | null; foto_bukti_urls: string[] | null;
  karyawan: { nama: string } | null;
}

const JENIS_LABEL: Record<string, string> = {
  harian_pulang: "Job Desc Pulang", piket: "Piket Toilet & Kulkas",
  deep_clean_area: "Deep Clean Area", deep_clean_alat: "Deep Clean Alat",
};

function tglWaktu(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function labelTgl(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function RiwayatTab() {
  const [loading, setLoading] = useState(true);
  const [sesiList, setSesiList] = useState<SesiRow[]>([]);
  const [hasilBySesi, setHasilBySesi] = useState<Record<string, HasilRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<string[] | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    const { data: sesi } = await supabase.from("audit_kebersihan_sesi")
      .select("id, tanggal_tugas, sesi, status, mulai_at, selesai_at, auditor:auditor_karyawan_id(nama)")
      .order("tanggal_tugas", { ascending: false }).order("sesi").limit(60);
    const sesiRows = (sesi as unknown as SesiRow[] | null) ?? [];
    setSesiList(sesiRows);

    const sesiIds = sesiRows.map((s) => s.id);
    if (sesiIds.length > 0) {
      const { data: hasil } = await supabase.from("audit_kebersihan_hasil")
        .select("id, sesi_id, jenis_audit_snapshot, area_label_snapshot, nama_tugas_snapshot, status, penanggung_jawab_tipe, karyawan_id, catatan, foto_bukti_urls, karyawan:karyawan_id(nama)")
        .in("sesi_id", sesiIds);
      const grouped: Record<string, HasilRow[]> = {};
      ((hasil as unknown as HasilRow[] | null) ?? []).forEach((h) => { (grouped[h.sesi_id] ??= []).push(h); });
      setHasilBySesi(grouped);
    } else {
      setHasilBySesi({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { muat(); }, [muat]);

  return (
    <div className="space-y-3 pb-8">
      <p className="text-sm text-gray-500">Riwayat semua sesi Audit Kebersihan yang sudah diisi SPV — 60 sesi terakhir.</p>

      {loading ? <p className="text-gray-400 text-sm text-center py-8">Memuat…</p> : sesiList.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">Belum ada sesi audit tercatat.</p>
      ) : (
        <div className="space-y-2">
          {sesiList.map((s) => {
            const items = hasilBySesi[s.id] ?? [];
            const lulus = items.filter((i) => i.status === "lulus").length;
            const gagal = items.filter((i) => i.status === "gagal").length;
            const buka = expanded === s.id;
            return (
              <div key={s.id} className="card overflow-hidden !p-0">
                <button onClick={() => setExpanded(buka ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${buka ? "rotate-180" : ""}`} />
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-sm text-gray-700 truncate">{labelTgl(s.tanggal_tugas)} · Sesi {s.sesi === "pagi" ? "Pagi" : "Malam"}</p>
                      <p className="text-[11px] text-gray-400">Diaudit oleh {s.auditor?.nama ?? "-"} · {tglWaktu(s.selesai_at ?? s.mulai_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.status === "selesai" ? (
                      <>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{lulus} lulus</span>
                        {gagal > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{gagal} gagal</span>}
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Draft — belum submit</span>
                    )}
                  </div>
                </button>

                {buka && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada item tercatat.</p>
                    ) : items.map((it) => (
                      <div key={it.id} className={`rounded-lg border p-2.5 text-xs ${it.status === "gagal" ? "border-red-100 bg-red-50/50" : "border-gray-100"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-700 flex items-center gap-1">
                              {it.status === "lulus"
                                ? <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                : <XCircle size={12} className="text-red-500 shrink-0" />}
                              {it.nama_tugas_snapshot}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {it.jenis_audit_snapshot ? JENIS_LABEL[it.jenis_audit_snapshot] ?? it.jenis_audit_snapshot : ""}
                              {it.area_label_snapshot ? ` · ${it.area_label_snapshot}` : ""}
                            </p>
                            {it.status === "gagal" && (
                              <p className="text-[11px] text-red-600 mt-0.5">
                                Penanggung: {it.penanggung_jawab_tipe === "individu" ? (it.karyawan?.nama ?? "-") : "Shift (tidak dapat dipastikan)"}
                              </p>
                            )}
                            {it.catatan && <p className="text-[11px] text-gray-500 italic mt-0.5">&ldquo;{it.catatan}&rdquo;</p>}
                          </div>
                          {!!it.foto_bukti_urls?.length && (
                            <button onClick={() => setFotoModal(it.foto_bukti_urls)} className="shrink-0 text-[10px] font-semibold text-teal-600 hover:underline flex items-center gap-1">
                              <Camera size={11} /> {it.foto_bukti_urls.length} foto
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
