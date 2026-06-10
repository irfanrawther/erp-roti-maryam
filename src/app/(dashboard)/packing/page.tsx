"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggal, formatTanggalWaktu } from "@/lib/utils";
import { Snowflake, ChevronRight, X, CheckCircle } from "lucide-react";

interface Batch {
  id: string;
  tanggal_produksi: string;
  shift: string;
  status: "adonan" | "packing" | "freezer" | "selesai";
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

const statusLabel: Record<string, string> = { adonan: "Adonan", packing: "Packing", freezer: "Freezer", selesai: "Selesai" };
const statusClass: Record<string, string> = { adonan: "badge-status-adonan", packing: "badge-status-packing", freezer: "badge-status-freezer", selesai: "badge-status-selesai" };
const nextStatus: Record<string, string> = { adonan: "packing", packing: "freezer", freezer: "selesai" };
const nextLabel: Record<string, string> = { adonan: "Pindah ke Packing", packing: "Pindah ke Freezer", freezer: "Selesai" };

interface UpdateModal {
  batch: Batch;
  nextSt: string;
}

export default function PackingPage() {
  const user = getUserSession();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [updateModal, setUpdateModal] = useState<UpdateModal | null>(null);
  const [formUpdate, setFormUpdate] = useState({ jumlah_pack: "", jumlah_reject: "0", catatan_reject: "" });

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

  function openUpdateModal(batch: Batch) {
    const next = nextStatus[batch.status];
    if (!next) return;
    const defaultJumlah = batch.status === "adonan"
      ? String(batch.jumlah_pack_adonan ?? batch.jumlah_pack_rencana)
      : batch.status === "packing"
      ? String(batch.jumlah_pack_packing ?? batch.jumlah_pack_adonan ?? batch.jumlah_pack_rencana)
      : String(batch.jumlah_pack_freezer ?? batch.jumlah_pack_packing ?? batch.jumlah_pack_rencana);
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

    if (batch.status === "adonan") updateData.jumlah_pack_packing = jumlah;
    else if (batch.status === "packing") updateData.jumlah_pack_freezer = jumlah;
    else if (batch.status === "freezer") {
      // selesai — no pack update needed
    }

    await supabase.from("batch_produksi").update(updateData).eq("id", batch.id);
    setLoading(false);
    setUpdateModal(null);
    fetchData();
  }

  const activeStatuses = ["adonan", "packing", "freezer"];

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Packing & Freezer</h1>
        <div className="flex gap-2">
          {["adonan", "packing", "freezer"].map((s) => (
            <span key={s} className={statusClass[s]}>{statusLabel[s]}: {batches.filter((b) => b.status === s).length}</span>
          ))}
        </div>
      </div>

      {/* Progress Pipeline */}
      <div className="card">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <span className="flex-1 text-center py-2 bg-yellow-50 rounded-lg text-yellow-700">🥣 Adonan</span>
          <ChevronRight size={16} />
          <span className="flex-1 text-center py-2 bg-blue-50 rounded-lg text-blue-700">📦 Packing</span>
          <ChevronRight size={16} />
          <span className="flex-1 text-center py-2 bg-indigo-50 rounded-lg text-indigo-700">❄️ Freezer</span>
        </div>
      </div>

      {/* Batch List per Status */}
      {activeStatuses.map((status) => {
        const batchInStatus = batches.filter((b) => b.status === status);
        if (batchInStatus.length === 0) return null;
        return (
          <div key={status} className="card">
            <h2 className={`font-semibold text-sm mb-3 flex items-center gap-2`}>
              <span className={statusClass[status]}>{statusLabel[status]}</span>
              <span className="text-gray-500">({batchInStatus.length} batch)</span>
            </h2>
            <div className="space-y-3">
              {batchInStatus.map((b) => (
                <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {(b.produk_sku as { nama_brand: string; varian: string })?.nama_brand} — {(b.produk_sku as { nama_brand: string; varian: string })?.varian}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTanggal(b.tanggal_produksi)} • Shift {b.shift}
                      </p>
                      <p className="text-xs text-gray-400">
                        Dibuat oleh {(b.users as { nama: string })?.nama} • {formatTanggalWaktu(b.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                    <div className="text-center bg-gray-50 rounded p-2">
                      <p className="text-gray-400">Rencana</p>
                      <p className="font-bold text-gray-700">{formatAngka(b.jumlah_pack_rencana)}</p>
                    </div>
                    {b.jumlah_pack_packing != null && (
                      <div className="text-center bg-blue-50 rounded p-2">
                        <p className="text-blue-400">Packing</p>
                        <p className="font-bold text-blue-700">{formatAngka(b.jumlah_pack_packing)}</p>
                      </div>
                    )}
                    {b.jumlah_pack_freezer != null && (
                      <div className="text-center bg-indigo-50 rounded p-2">
                        <p className="text-indigo-400">Freezer</p>
                        <p className="font-bold text-indigo-700">{formatAngka(b.jumlah_pack_freezer)}</p>
                      </div>
                    )}
                    {b.jumlah_reject > 0 && (
                      <div className="text-center bg-red-50 rounded p-2">
                        <p className="text-red-400">Reject</p>
                        <p className="font-bold text-red-600">{formatAngka(b.jumlah_reject)}</p>
                      </div>
                    )}
                  </div>

                  {nextStatus[b.status] && (
                    <button
                      onClick={() => openUpdateModal(b)}
                      className="btn-primary w-full text-sm py-2"
                    >
                      {nextLabel[b.status]}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {batches.length === 0 && (
        <div className="card text-center py-8">
          <Snowflake size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400">Tidak ada batch yang sedang berjalan</p>
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
                  {(updateModal.batch.produk_sku as { nama_brand: string; varian: string })?.nama_brand} — {(updateModal.batch.produk_sku as { nama_brand: string; varian: string })?.varian}
                </p>
                <p className="text-sm text-gray-500">
                  <span className={statusClass[updateModal.batch.status]}>{statusLabel[updateModal.batch.status]}</span>
                  {" → "}
                  <span className={statusClass[updateModal.nextSt]}>{statusLabel[updateModal.nextSt]}</span>
                </p>
              </div>

              {updateModal.batch.status !== "freezer" && (
                <div>
                  <label className="label">
                    Jumlah Pack {updateModal.nextSt === "packing" ? "setelah Packing" : "masuk Freezer"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={formUpdate.jumlah_pack}
                    onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_pack: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Bisa berbeda dari rencana ({formatAngka(updateModal.batch.jumlah_pack_rencana)} pack) karena reject
                  </p>
                </div>
              )}

              <div>
                <label className="label">Jumlah Reject/Defect</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={formUpdate.jumlah_reject}
                  onChange={(e) => setFormUpdate({ ...formUpdate, jumlah_reject: e.target.value })}
                />
              </div>

              {parseInt(formUpdate.jumlah_reject) > 0 && (
                <div>
                  <label className="label">Catatan Reject</label>
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={formUpdate.catatan_reject}
                    onChange={(e) => setFormUpdate({ ...formUpdate, catatan_reject: e.target.value })}
                    placeholder="Penyebab reject..."
                  />
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
