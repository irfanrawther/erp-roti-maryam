"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal, formatTanggalWaktu } from "@/lib/utils";
import { Snowflake, ChevronRight, ChevronLeft, X, CheckCircle } from "lucide-react";

interface Batch {
  id: string;
  tanggal_produksi: string;
  shift: string;
  status: "adonan" | "bikin" | "packing" | "freezer" | "selesai";
  jumlah_pack_rencana: number;
  jumlah_pack_adonan: number | null;
  jumlah_pack_packing: number | null;
  jumlah_pack_freezer: number | null;
  jumlah_reject: number;
  catatan_reject: string | null;
  keterangan: string | null;
  status_updated_at: string;
  created_at: string;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number };
  users: { nama: string };
  updated_user: { nama: string } | null;
}

// Flow: adonan → bikin → packing → freezer → selesai
const STAGES = ["adonan", "bikin", "packing", "freezer"] as const;
type Stage = typeof STAGES[number];

const statusLabel: Record<string, string> = {
  adonan:  "Adonan",
  bikin:   "Bikin",
  packing: "Panggang & Packing",
  freezer: "Freezer",
  selesai: "Selesai",
};
const statusClass: Record<string, string> = {
  adonan:  "badge-status-adonan",
  bikin:   "badge-status-bikin",
  packing: "badge-status-packing",
  freezer: "badge-status-freezer",
  selesai: "badge-status-selesai",
};
const nextStatus: Record<string, string> = {
  adonan:  "bikin",
  bikin:   "packing",
  packing: "freezer",
  freezer: "selesai",
};
const nextLabel: Record<string, string> = {
  adonan:  "Pindah ke Bikin",
  bikin:   "Pindah ke Panggang & Packing",
  packing: "Pindah ke Freezer",
  freezer: "Selesai",
};
const prevStatus: Record<string, string> = {
  bikin:   "adonan",
  packing: "bikin",
  freezer: "packing",
};
const prevLabel: Record<string, string> = {
  bikin:   "Kembali ke Adonan",
  packing: "Kembali ke Bikin",
  freezer: "Kembali ke Panggang & Packing",
};

const PCS_PER_KG: Record<string, Record<string, number>> = {
  "Cane RawtheR":      { "Original": 20, "Melted Choco": 25, "Grated Cheese": 25, "Whole Wheat": 20 },
  "Mehana Boga Utama": { "Original": 45, "Cokelat": 45, "Keju": 45 },
};

const stageIcon: Record<string, string> = {
  adonan:  "🥣",
  bikin:   "🍳",
  packing: "📦",
  freezer: "❄️",
};

interface UpdateModal {
  batch: Batch;
  nextSt: string;
}
interface UndoModal {
  batch: Batch;
  prevSt: string;
}

export default function PackingPage() {
  const user = getUserSession();
  const [batches,     setBatches]     = useState<Batch[]>([]);
  const [activeTab,   setActiveTab]   = useState<Stage>("adonan");
  const [loading,     setLoading]     = useState(false);
  const [updateModal, setUpdateModal] = useState<UpdateModal | null>(null);
  const [undoModal,   setUndoModal]   = useState<UndoModal | null>(null);
  const [formUpdate,  setFormUpdate]  = useState({ jumlah_pack: "", jumlah_reject: "0", catatan_reject: "" });

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("packing-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_produksi" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    const { data } = await supabase
      .from("batch_produksi")
      .select("id, tanggal_produksi, shift, status, jumlah_pack_rencana, jumlah_pack_adonan, jumlah_pack_packing, jumlah_pack_freezer, jumlah_reject, catatan_reject, keterangan, status_updated_at, created_at, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack), users:created_by(nama)")
      .neq("status", "selesai")
      .order("created_at", { ascending: false });
    if (data) setBatches(data as unknown as Batch[]);
  }

  function countFor(stage: Stage) {
    return batches.filter((b) => b.status === stage).length;
  }

  function openUpdateModal(batch: Batch) {
    const next = nextStatus[batch.status];
    if (!next) return;
    const sku = batch.produk_sku as { nama_brand: string; varian: string };
    const pcsPerKg = PCS_PER_KG[sku?.nama_brand]?.[sku?.varian] ?? 0;
    const standarPcs = Math.round(batch.jumlah_pack_rencana * pcsPerKg);
    const defaultJumlah =
      batch.status === "adonan" ? String(batch.jumlah_pack_adonan ?? (standarPcs > 0 ? standarPcs : "")) :
      batch.status === "bikin"  ? String(batch.jumlah_pack_adonan ?? batch.jumlah_pack_rencana) :
      batch.status === "packing"? String(batch.jumlah_pack_packing ?? batch.jumlah_pack_adonan ?? batch.jumlah_pack_rencana) :
                                   String(batch.jumlah_pack_freezer ?? batch.jumlah_pack_packing ?? batch.jumlah_pack_rencana);
    setFormUpdate({ jumlah_pack: defaultJumlah, jumlah_reject: "0", catatan_reject: "" });
    setUpdateModal({ batch, nextSt: next });
  }

  async function handleUpdate() {
    if (!user || !updateModal) return;
    setLoading(true);
    const { batch, nextSt } = updateModal;
    const jumlah = parseInt(formUpdate.jumlah_pack);
    const reject = parseInt(formUpdate.jumlah_reject) || 0;

    const updateData: Record<string, unknown> = {
      status: nextSt,
      updated_by: user.id,
      status_updated_at: new Date().toISOString(),
      jumlah_reject: reject,
      catatan_reject: formUpdate.catatan_reject || null,
    };

    if (batch.status === "adonan")  updateData.jumlah_pack_adonan  = jumlah; // jumlah direndam (Pcs)
    if (batch.status === "bikin")   updateData.jumlah_pack_packing = jumlah;
    if (batch.status === "packing") updateData.jumlah_pack_freezer = jumlah;

    await supabase.from("batch_produksi").update(updateData).eq("id", batch.id);
    setLoading(false);
    setUpdateModal(null);
    fetchData();
  }

  async function handleUndo() {
    if (!user || !undoModal) return;
    setLoading(true);
    const { batch, prevSt } = undoModal;
    // Clear field yang terkait dengan stage yang ditinggalkan
    const clearData: Record<string, unknown> = {
      status: prevSt,
      updated_by: user.id,
      status_updated_at: new Date().toISOString(),
    };
    if (batch.status === "packing") clearData.jumlah_pack_packing = null;
    if (batch.status === "freezer") clearData.jumlah_pack_freezer = null;

    await supabase.from("batch_produksi").update(clearData).eq("id", batch.id);
    setLoading(false);
    setUndoModal(null);
    fetchData();
  }

  const batchInTab = batches.filter((b) => b.status === activeTab);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">Packing & Freezer</h1>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <span key={s} className={statusClass[s]}>
              {statusLabel[s]}: {countFor(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="card py-3">
        <div className="flex items-center gap-1 text-sm font-medium text-gray-500 overflow-x-auto">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setActiveTab(s)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  activeTab === s
                    ? s === "adonan"  ? "bg-yellow-100 text-yellow-800 font-semibold" :
                      s === "bikin"   ? "bg-orange-100 text-orange-800 font-semibold" :
                      s === "packing" ? "bg-blue-100 text-blue-800 font-semibold" :
                                        "bg-indigo-100 text-indigo-800 font-semibold"
                    : "hover:bg-gray-100 text-gray-400"
                }`}
              >
                <span>{stageIcon[s]}</span>
                <span>{statusLabel[s]}</span>
                {countFor(s) > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === s ? "bg-white/70" : "bg-gray-200 text-gray-600"
                  }`}>
                    {countFor(s)}
                  </span>
                )}
              </button>
              {i < STAGES.length - 1 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Batch list untuk tab aktif */}
      <div className="card">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <span>{stageIcon[activeTab]}</span>
          <span className={statusClass[activeTab]}>{statusLabel[activeTab]}</span>
          <span className="text-gray-500">({batchInTab.length} batch)</span>
        </h2>

        {batchInTab.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">Tidak ada batch di stage {statusLabel[activeTab]}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batchInTab.map((b) => {
              const sku = b.produk_sku as { nama_brand: string; varian: string };
              return (
                <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {sku?.nama_brand} — {sku?.varian}
                      </p>
                      <p className="text-xs text-gray-500">{formatTanggal(b.tanggal_produksi)}</p>
                      <p className="text-xs text-gray-400">
                        oleh {(b.users as { nama: string })?.nama} · {formatTanggalWaktu(b.created_at)}
                      </p>
                    </div>
                    <span className={statusClass[b.status]}>{statusLabel[b.status]}</span>
                  </div>

                  <div className="flex gap-2 mb-3 text-xs flex-wrap">
                    <div className="text-center bg-gray-50 rounded px-3 py-2 min-w-[60px]">
                      <p className="text-gray-400">Adonan</p>
                      <p className="font-bold text-gray-700">{formatAngka(b.jumlah_pack_rencana)} kg</p>
                    </div>
                    {b.jumlah_pack_adonan != null && b.status !== "adonan" && (
                      <div className="text-center bg-orange-50 rounded px-3 py-2 min-w-[60px]">
                        <p className="text-orange-400">Direndam</p>
                        <p className="font-bold text-orange-700">{formatAngka(b.jumlah_pack_adonan)} pcs</p>
                      </div>
                    )}
                    {b.jumlah_pack_packing != null && (
                      <div className="text-center bg-blue-50 rounded px-3 py-2 min-w-[60px]">
                        <p className="text-blue-400">Packing</p>
                        <p className="font-bold text-blue-700">{formatAngka(b.jumlah_pack_packing)}</p>
                      </div>
                    )}
                    {b.jumlah_pack_freezer != null && (
                      <div className="text-center bg-indigo-50 rounded px-3 py-2 min-w-[60px]">
                        <p className="text-indigo-400">Freezer</p>
                        <p className="font-bold text-indigo-700">{formatAngka(b.jumlah_pack_freezer)}</p>
                      </div>
                    )}
                    {b.jumlah_reject > 0 && (
                      <div className="text-center bg-red-50 rounded px-3 py-2 min-w-[60px]">
                        <p className="text-red-400">Reject</p>
                        <p className="font-bold text-red-600">{formatAngka(b.jumlah_reject)}</p>
                      </div>
                    )}
                  </div>

                  <div className={`flex gap-2 ${prevStatus[b.status] ? "flex-col sm:flex-row" : ""}`}>
                    {nextStatus[b.status] && (
                      <button
                        onClick={() => openUpdateModal(b)}
                        className="btn-primary flex-1 text-sm py-2"
                      >
                        {nextLabel[b.status]}
                      </button>
                    )}
                    {prevStatus[b.status] && (
                      <button
                        onClick={() => setUndoModal({ batch: b, prevSt: prevStatus[b.status] })}
                        className="flex items-center justify-center gap-1.5 flex-1 text-sm py-2 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors font-medium"
                      >
                        <ChevronLeft size={15} />
                        {prevLabel[b.status]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {batches.length === 0 && (
        <div className="card text-center py-8">
          <Snowflake size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400">Tidak ada batch yang sedang berjalan</p>
        </div>
      )}

      {/* Undo Modal */}
      {undoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">Kembalikan ke Stage Sebelumnya</h2>
              <button onClick={() => setUndoModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="font-medium text-gray-800 text-sm">
                  {(undoModal.batch.produk_sku as { nama_brand: string; varian: string })?.nama_brand} —{" "}
                  {(undoModal.batch.produk_sku as { nama_brand: string; varian: string })?.varian}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className={statusClass[undoModal.batch.status]}>{statusLabel[undoModal.batch.status]}</span>
                  {" → "}
                  <span className={statusClass[undoModal.prevSt]}>{statusLabel[undoModal.prevSt]}</span>
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Item akan dipindahkan kembali ke stage <strong>{statusLabel[undoModal.prevSt]}</strong>.
                {undoModal.batch.status === "packing" && " Data jumlah pack packing akan dihapus."}
                {undoModal.batch.status === "freezer" && " Data jumlah pack freezer akan dihapus."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setUndoModal(null)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleUndo}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <ChevronLeft size={15} />
                  {loading ? "Memproses..." : `Kembali ke ${statusLabel[undoModal.prevSt]}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {updateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">Update Status Batch</h2>
              <button onClick={() => setUpdateModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-800">
                  {(updateModal.batch.produk_sku as { nama_brand: string; varian: string })?.nama_brand} —{" "}
                  {(updateModal.batch.produk_sku as { nama_brand: string; varian: string })?.varian}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className={statusClass[updateModal.batch.status]}>{statusLabel[updateModal.batch.status]}</span>
                  {" → "}
                  <span className={statusClass[updateModal.nextSt]}>{statusLabel[updateModal.nextSt]}</span>
                </p>
              </div>

              {/* Adonan → Bikin: input jumlah direndam + catatan */}
              {updateModal.batch.status === "adonan" && (() => {
                const skuU = updateModal.batch.produk_sku as { nama_brand: string; varian: string };
                const pcsKg = PCS_PER_KG[skuU?.nama_brand]?.[skuU?.varian] ?? 0;
                const standar = Math.round(updateModal.batch.jumlah_pack_rencana * pcsKg);
                return (
                  <>
                    {standar > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg">
                        <span className="text-xs text-amber-700 font-medium">Standar</span>
                        <span className="text-sm font-bold text-amber-700">{formatAngka(standar)} pcs</span>
                      </div>
                    )}
                    <div>
                      <label className="label">Total Jumlah Direndam (Actual)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          className="input flex-1 text-lg font-semibold"
                          placeholder="0"
                          value={formUpdate.jumlah_pack}
                          onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_pack: e.target.value })}
                        />
                        <span className="text-sm font-semibold text-gray-500 shrink-0">Pcs</span>
                      </div>
                    </div>
                    <div>
                      <label className="label">Catatan <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea
                        className="input resize-none"
                        rows={2}
                        placeholder="Catatan tambahan..."
                        value={formUpdate.catatan_reject}
                        onChange={(e) => setFormUpdate({ ...formUpdate, catatan_reject: e.target.value })}
                      />
                    </div>
                  </>
                );
              })()}

              {/* Bikin → Packing: jumlah pack */}
              {updateModal.batch.status === "bikin" && (
                <>
                  <div>
                    <label className="label">Jumlah Pack setelah Panggang & Packing</label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={formUpdate.jumlah_pack}
                      onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_pack: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Jumlah Reject/Defect</label>
                    <input type="number" min="0" className="input" value={formUpdate.jumlah_reject}
                      onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_reject: e.target.value })} />
                  </div>
                  {parseInt(formUpdate.jumlah_reject) > 0 && (
                    <div>
                      <label className="label">Catatan Reject</label>
                      <textarea className="input resize-none" rows={2} placeholder="Penyebab reject..."
                        value={formUpdate.catatan_reject}
                        onChange={(e) => setFormUpdate({ ...formUpdate, catatan_reject: e.target.value })} />
                    </div>
                  )}
                </>
              )}

              {/* Packing → Freezer: jumlah pack */}
              {updateModal.batch.status === "packing" && (
                <>
                  <div>
                    <label className="label">Jumlah Pack masuk Freezer</label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={formUpdate.jumlah_pack}
                      onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_pack: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Jumlah Reject/Defect</label>
                    <input type="number" min="0" className="input" value={formUpdate.jumlah_reject}
                      onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_reject: e.target.value })} />
                  </div>
                  {parseInt(formUpdate.jumlah_reject) > 0 && (
                    <div>
                      <label className="label">Catatan Reject</label>
                      <textarea className="input resize-none" rows={2} placeholder="Penyebab reject..."
                        value={formUpdate.catatan_reject}
                        onChange={(e) => setFormUpdate({ ...formUpdate, catatan_reject: e.target.value })} />
                    </div>
                  )}
                </>
              )}

              {/* Freezer → Selesai: catatan saja */}
              {updateModal.batch.status === "freezer" && (
                <div>
                  <label className="label">Catatan <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea className="input resize-none" rows={2} placeholder="Catatan tambahan..."
                    value={formUpdate.catatan_reject}
                    onChange={(e) => setFormUpdate({ ...formUpdate, catatan_reject: e.target.value })} />
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setUpdateModal(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={handleUpdate} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <CheckCircle size={16} />
                  {loading ? "Memproses..." : "Konfirmasi"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
