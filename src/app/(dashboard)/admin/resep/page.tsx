"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin } from "@/lib/auth";
import { X, Trash2, Plus, ShieldAlert, BookOpen, ChevronRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface ProdukSku { id: string; brand: string; varian: string; }
interface BahanBaku { id: string; nama: string; }
interface ResepItem {
  id: string; produk_sku_id: string;
  bahan_baku_id: string; jumlah_per_pack: number; satuan: string;
}
interface FormRow {
  bahan_baku_id: string; nama: string; jumlah: string; satuan: string;
}

// State satu modal terpadu
interface ModalState {
  canonicalId: string;   // SKU id yang dipakai untuk simpan/baca
  brand: "cane" | "mehana";
  groupLabel: string;    // teks judul modal
  namaList: string[];    // urutan bahan
  satuanOpts: string[];
}

// ── Konstanta ─────────────────────────────────────────────────
// Bahan untuk Original / Melted Choco / Grated Cheese (tanpa Tepung Gandum Utuh)
const BAHAN_CANE_REGULAR: string[] = [
  "Terigu", "Margarine Blue Band", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam", "Telur", "Baking Powder",
];
// Bahan untuk Whole Wheat (dengan Tepung Gandum Utuh)
const BAHAN_CANE_WW: string[] = [
  "Terigu", "Margarine Blue Band", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam", "Telur", "Baking Powder", "Tepung Gandum",
];
const BAHAN_MEHANA: string[] = [
  "Terigu", "Margarine Menara", "Garam", "Gula", "Air",
  "Minyak Resep", "Minyak Rendam",
];
const SATUAN_CANE   = ["gr", "ml", "L", "Kg", "Pcs"];
const SATUAN_MEHANA = ["gr", "ml", "L", "Kg"];

// Dua grup Cane — label + cara mencari canonical SKU-nya
const CANE_GROUPS = [
  {
    key: "regular",
    label: "Original, Melted Choco, Grated Cheese",
    bahan: BAHAN_CANE_REGULAR,
    matchVarian: (v: string) => v !== "Whole Wheat",
  },
  {
    key: "wholewheat",
    label: "Whole Wheat",
    bahan: BAHAN_CANE_WW,
    matchVarian: (v: string) => v === "Whole Wheat",
  },
] as const;

// ── Halaman ───────────────────────────────────────────────────
export default function AdminResepPage() {
  const router = useRouter();
  const me     = getUserSession();

  const [skuList,   setSkuList]   = useState<ProdukSku[]>([]);
  const [bahanList, setBahanList] = useState<BahanBaku[]>([]);
  const [resepMap,  setResepMap]  = useState<Record<string, ResepItem[]>>({});

  const [modal,       setModal]       = useState<ModalState | null>(null);
  const [formRows,    setFormRows]    = useState<FormRow[]>([]);
  const [addBahanId,  setAddBahanId]  = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saveOk,      setSaveOk]      = useState(false);

  // ── Auth guard ────────────────────────────────────────────
  useEffect(() => {
    if (!me || !canAccessAdmin(me.role)) { router.replace("/dashboard"); return; }
    fetchAll();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────
  async function fetchAll() {
    const [skuRes, bahanRes, resepRes] = await Promise.all([
      supabase.from("produk_sku").select("id, brand, varian").eq("aktif", true),
      supabase.from("bahan_baku").select("id, nama").eq("aktif", true).order("nama"),
      supabase.from("master_resep").select("id, produk_sku_id, bahan_baku_id, jumlah_per_pack, satuan"),
    ]);
    if (skuRes.data)   setSkuList(skuRes.data);
    if (bahanRes.data) setBahanList(bahanRes.data);
    if (resepRes.data) {
      const map: Record<string, ResepItem[]> = {};
      for (const r of resepRes.data as ResepItem[]) {
        if (!map[r.produk_sku_id]) map[r.produk_sku_id] = [];
        map[r.produk_sku_id].push(r);
      }
      setResepMap(map);
    }
  }

  // ── Cari canonical SKU ────────────────────────────────────
  function getSkuId(brand: "cane" | "mehana", matchVarian?: (v: string) => boolean): string {
    const list = skuList.filter((s) => s.brand === brand);
    const found = matchVarian ? list.find((s) => matchVarian(s.varian)) : list[0];
    return found?.id ?? "";
  }

  // ── Hitung bahan tersimpan yang relevan dengan daftar grup ──
  // (hanya bahan yang ada di namaList, bukan semua record di DB)
  function jumlahTersimpan(skuId: string, namaList: string[]): number {
    if (!skuId) return 0;
    const savedIds = new Set((resepMap[skuId] ?? []).map((r) => r.bahan_baku_id));
    return namaList.filter((nama) => {
      const db = bahanList.find(
        (b) => b.nama.toLowerCase().includes(nama.toLowerCase()) ||
               nama.toLowerCase().includes(b.nama.toLowerCase())
      );
      return db && savedIds.has(db.id);
    }).length;
  }

  // ── Buka modal ────────────────────────────────────────────
  function openModal(
    brand: "cane" | "mehana",
    groupLabel: string,
    namaList: string[],
    satuanOpts: string[],
    matchVarian?: (v: string) => boolean
  ) {
    const skuId    = getSkuId(brand, matchVarian);
    const existing = skuId ? (resepMap[skuId] ?? []) : [];
    const rows: FormRow[] = namaList.map((nama) => {
      const db    = matchBahan(nama);
      const saved = db ? existing.find((e) => e.bahan_baku_id === db.id) : undefined;
      return { bahan_baku_id: db?.id ?? "", nama, jumlah: saved ? String(saved.jumlah_per_pack) : "", satuan: saved?.satuan ?? "" };
    });
    setModal({ canonicalId: skuId, brand, groupLabel, namaList, satuanOpts });
    setFormRows(rows);
    setAddBahanId("");
    setSaveOk(false);
  }

  function closeModal() { setModal(null); setFormRows([]); setAddBahanId(""); setSaveOk(false); }

  // ── Match bahan ke DB ─────────────────────────────────────
  function matchBahan(nama: string): BahanBaku | undefined {
    return bahanList.find((b) =>
      b.nama.toLowerCase().includes(nama.toLowerCase()) ||
      nama.toLowerCase().includes(b.nama.toLowerCase())
    );
  }

  // ── Update, delete, tambah baris form ────────────────────
  function updateRow(idx: number, field: "jumlah" | "satuan", value: string) {
    setFormRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setSaveOk(false);
  }

  async function deleteRow(idx: number) {
    const row = formRows[idx];
    if (modal?.canonicalId && row.bahan_baku_id) {
      const rec = (resepMap[modal.canonicalId] ?? []).find((e) => e.bahan_baku_id === row.bahan_baku_id);
      if (rec) { await supabase.from("master_resep").delete().eq("id", rec.id); await fetchAll(); }
    }
    setFormRows((prev) => prev.filter((_, i) => i !== idx));
    setSaveOk(false);
  }

  function addBahan() {
    if (!addBahanId) return;
    const db = bahanList.find((b) => b.id === addBahanId);
    if (!db || formRows.some((r) => r.bahan_baku_id === addBahanId)) return;
    setFormRows((prev) => [...prev, { bahan_baku_id: db.id, nama: db.nama, jumlah: "", satuan: "" }]);
    setAddBahanId("");
    setSaveOk(false);
  }

  // ── Simpan ────────────────────────────────────────────────
  async function handleSave() {
    if (!me || !modal?.canonicalId) return;
    setSaving(true);
    const existing = resepMap[modal.canonicalId] ?? [];
    for (const row of formRows) {
      if (!row.bahan_baku_id) continue;
      const rec      = existing.find((e) => e.bahan_baku_id === row.bahan_baku_id);
      const hasValue = row.jumlah.trim() !== "" && parseFloat(row.jumlah) > 0 && row.satuan !== "";
      if (hasValue) {
        if (rec) {
          await supabase.from("master_resep").update({ jumlah_per_pack: parseFloat(row.jumlah), satuan: row.satuan }).eq("id", rec.id);
        } else {
          await supabase.from("master_resep").insert({ produk_sku_id: modal.canonicalId, bahan_baku_id: row.bahan_baku_id, jumlah_per_pack: parseFloat(row.jumlah), satuan: row.satuan, keterangan: null, created_by: me.id });
        }
      } else if (rec) {
        await supabase.from("master_resep").delete().eq("id", rec.id);
      }
    }
    await fetchAll();
    setSaving(false);
    setSaveOk(true);
  }

  // ── Derived: dropdown "tambah bahan" ─────────────────────
  const tampilDiForm  = new Set(formRows.map((r) => r.bahan_baku_id).filter(Boolean));
  const bahanBrand    = bahanList.filter((b) =>
    (modal?.namaList ?? []).some((n) =>
      b.nama.toLowerCase().includes(n.toLowerCase()) ||
      n.toLowerCase().includes(b.nama.toLowerCase())
    )
  );
  const pilihanTambah = bahanBrand.filter((b) => !tampilDiForm.has(b.id));

  // ── Access denied ─────────────────────────────────────────
  if (!me || !canAccessAdmin(me.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center"><ShieldAlert size={32} className="text-red-400 mx-auto mb-2" /><p className="text-gray-500">Akses ditolak</p></div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Master Resep Adonan</h1>

      <div className="space-y-4">
        {/* ── Card Cane RawtheR (dengan 2 sub-item) ── */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <p className="font-bold text-gray-700">Cane RawtheR</p>
          </div>
          <div className="space-y-2">
            {CANE_GROUPS.map((grp) => {
              const skuId   = getSkuId("cane", grp.matchVarian);
              const jumlah  = jumlahTersimpan(skuId, grp.bahan);
              const filled  = jumlah > 0;
              return (
                <button
                  key={grp.key}
                  onClick={() => openModal("cane", grp.label, grp.bahan, SATUAN_CANE, grp.matchVarian)}
                  className="w-full flex items-center justify-between bg-gray-50 hover:bg-amber-50 border border-gray-100 hover:border-amber-200 rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                >
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-800">{grp.label}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {filled ? `${jumlah} / ${grp.bahan.length} bahan` : "Belum diisi"}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Card Mehana Boga Utama ── */}
        {(() => {
          const skuId  = getSkuId("mehana");
          const jumlah = jumlahTersimpan(skuId, BAHAN_MEHANA);
          const filled = jumlah > 0;
          return (
            <button
              onClick={() => openModal("mehana", "Mehana Boga Utama", BAHAN_MEHANA, SATUAN_MEHANA)}
              className="card w-full text-left hover:shadow-md hover:border-blue-200 active:scale-[0.98] transition-all border border-transparent p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                  <p className="font-bold text-gray-700">Mehana Boga Utama</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${filled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {filled ? `${jumlah} / ${BAHAN_MEHANA.length} bahan` : "Belum diisi"}
                </span>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          );
        })()}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-amber-500" />
                <div>
                  <p className="font-bold text-gray-800 leading-tight text-sm">{modal.groupLabel}</p>
                  <p className="text-xs text-gray-400">{modal.brand === "cane" ? "Cane RawtheR" : "Mehana Boga Utama"} · Resep Mixing Adonan</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {/* Header kolom */}
              <div className="grid grid-cols-[1fr_90px_80px_28px] gap-2 px-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bahan</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">per 1kg</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Satuan</p>
                <span />
              </div>

              {/* Baris */}
              <div className="space-y-1.5">
                {formRows.map((row, idx) => (
                  <div key={row.bahan_baku_id || row.nama}
                    className="grid grid-cols-[1fr_90px_80px_28px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                    <p className={`text-sm font-medium leading-tight ${!row.bahan_baku_id ? "text-gray-300" : "text-gray-800"}`}>
                      {row.nama}
                      {!row.bahan_baku_id && <span className="block text-[10px] text-red-400">tidak ditemukan di DB</span>}
                    </p>
                    <input type="number" step="0.001" min="0" placeholder="—"
                      disabled={!row.bahan_baku_id} value={row.jumlah}
                      onChange={(e) => updateRow(idx, "jumlah", e.target.value)}
                      className="input text-center text-sm py-1.5 disabled:bg-gray-100 disabled:text-gray-300" />
                    <select disabled={!row.bahan_baku_id} value={row.satuan}
                      onChange={(e) => updateRow(idx, "satuan", e.target.value)}
                      className="input text-sm py-1.5 text-center disabled:bg-gray-100 disabled:text-gray-300">
                      <option value="">—</option>
                      {modal.satuanOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => deleteRow(idx)}
                      className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Tambah bahan */}
              {pilihanTambah.length > 0 && (
                <div className="flex gap-2 items-center pt-1 border-t border-dashed border-gray-200">
                  <select className="input text-sm flex-1" value={addBahanId} onChange={(e) => setAddBahanId(e.target.value)}>
                    <option value="">+ Tambah bahan...</option>
                    {pilihanTambah.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
                  </select>
                  <button type="button" onClick={addBahan} disabled={!addBahanId} className="btn-primary px-3 py-2 disabled:opacity-40">
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex items-center gap-3">
              {saveOk && <p className="text-sm text-green-600 font-medium flex-1">✓ Tersimpan!</p>}
              <button onClick={closeModal} className="btn-secondary">Tutup</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
