"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { formatAngka, formatTanggal } from "@/lib/utils";
import { Package, ChefHat, Truck, Snowflake, X, AlertTriangle, ArrowUpRight } from "lucide-react";

interface StokBahan {
  id: string;
  nama: string;
  satuan: string;
  stok_saat_ini: number;
  stok_minimum: number;
}

interface StokProduk {
  id: string;
  brand: string;
  nama_brand: string;
  varian: string;
  isi_per_pack: number;
  kode_sku: string;
  stok_saat_ini: number;
}

interface BatchBerjalan {
  id: string;
  tanggal_produksi: string;
  shift: string;
  status: string;
  jumlah_pack_rencana: number;
  jumlah_pack_adonan: number | null;
  produk_sku: { nama_brand: string; varian: string; isi_per_pack: number };
  users: { nama: string };
}

interface PengirimanHariIni {
  id: string;
  jumlah_pack: number;
  produk_sku: { brand: string; varian: string; isi_per_pack: number };
}

export default function DashboardPage() {
  const user = getUserSession();
  const router = useRouter();
  const caps = getCapabilities(user);
  const isPic = user?.role === "pic"; // PIC: hanya card Bahan Baku, Batch Adonan Aktif, Batch Adonan
  const isSpv = user?.role === "spv"; // SPV: hanya card Stok Produk Jadi (Cane RawtheR saja)
  const today = new Date().toISOString().split("T")[0];

  const [bahanKritis, setBahanKritis] = useState<StokBahan[]>([]);
  const [allBahan, setAllBahan] = useState<StokBahan[]>([]);
  const [stokProduk, setStokProduk] = useState<StokProduk[]>([]);
  const [batchBerjalan, setBatchBerjalan] = useState<BatchBerjalan[]>([]);
  const [pengirimanHariIni, setPengirimanHariIni] = useState<PengirimanHariIni[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModalBahan, setShowModalBahan] = useState(false);
  const [showModalKiriman, setShowModalKiriman] = useState<"cane" | "mehana" | null>(null);
  const [showModalBatch,   setShowModalBatch]   = useState(false);

  // Route guard — hanya Super Admin yang punya akses Dashboard
  useEffect(() => {
    if (user && !caps.dashboard) router.replace(homeRoute(user));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && !caps.dashboard) return;
    fetchAll();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public" }, fetchAll)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [bahanRes, produkRes, batchRes, pengirimanRes] = await Promise.all([
      supabase.from("bahan_baku").select("id, nama, satuan, stok_saat_ini, stok_minimum").eq("aktif", true).order("nama"),
      supabase.from("produk_sku").select("id, brand, nama_brand, varian, isi_per_pack, kode_sku, stok_saat_ini").eq("aktif", true),
      supabase.from("batch_produksi").select("id, tanggal_produksi, shift, status, jumlah_pack_rencana, jumlah_pack_adonan, produk_sku:produk_sku_id(nama_brand, varian, isi_per_pack), users:created_by(nama)").neq("status", "selesai").order("created_at", { ascending: false }),
      supabase.from("pengiriman").select("id, jumlah_pack, produk_sku:produk_sku_id(brand, varian, isi_per_pack)").eq("tanggal_keluar", today),
    ]);

    if (bahanRes.data) {
      setAllBahan(bahanRes.data);
      setBahanKritis(bahanRes.data.filter((b) => b.stok_saat_ini <= b.stok_minimum));
    }
    if (produkRes.data) {
      const CANE_ORD = ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"];
      const MEHANA_ORD = ["Original", "Cokelat", "Keju"];
      const sorted = [...produkRes.data].sort((a, b) => {
        const ab = (a.brand as string), bb = (b.brand as string);
        if (ab !== bb) return ab === "cane" ? -1 : 1;
        const ord = ab === "cane" ? CANE_ORD : MEHANA_ORD;
        // Mehana: group by isi_per_pack (5 dulu, 10 kemudian); Cane: skip
        if (ab === "mehana") {
          const packDiff = (a.isi_per_pack as number) - (b.isi_per_pack as number);
          if (packDiff !== 0) return packDiff;
        }
        const ai = ord.indexOf(a.varian as string), bi = ord.indexOf(b.varian as string);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setStokProduk(sorted);
    }
    if (batchRes.data) setBatchBerjalan(batchRes.data as unknown as BatchBerjalan[]);
    if (pengirimanRes.data) setPengirimanHariIni(pengirimanRes.data as unknown as PengirimanHariIni[]);
    setLoading(false);
  }

  const CANE_VARIANTS_ORD   = ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"];
  const MEHANA_VARIANTS_ORD = ["Original", "Cokelat", "Keju"];

  // Hitung total pcs per brand hari ini
  const canePcs = pengirimanHariIni
    .filter((p) => p.produk_sku?.brand === "cane")
    .reduce((s, p) => s + p.jumlah_pack * (p.produk_sku?.isi_per_pack ?? 0), 0);
  const mehanaPcs = pengirimanHariIni
    .filter((p) => p.produk_sku?.brand === "mehana")
    .reduce((s, p) => s + p.jumlah_pack * (p.produk_sku?.isi_per_pack ?? 0), 0);
  // Derive brand key from nama_brand
  function brandKeyOf(b: BatchBerjalan): "cane" | "mehana" | null {
    const nm = (b.produk_sku?.nama_brand ?? "").toLowerCase();
    if (nm.includes("cane"))   return "cane";
    if (nm.includes("mehana")) return "mehana";
    return null;
  }

  // Batch yang sudah dikonfirmasi dari Rendam (status "packing" atau "freezer")
  // jumlah_pack_adonan berisi actual pcs yang direndam
  const batchRendam   = batchBerjalan.filter((b) => b.status === "packing" || b.status === "freezer");
  const totalDirendam = batchRendam.reduce((s, b) => s + (b.jumlah_pack_adonan ?? 0), 0);

  const statusLabels: Record<string, string> = { adonan: "Adonan", packing: "Packing", freezer: "Freezer", selesai: "Selesai" };
  const statusClass: Record<string, string> = { adonan: "badge-status-adonan", packing: "badge-status-packing", freezer: "badge-status-freezer", selesai: "badge-status-selesai" };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Selamat datang, {user?.nama} 👋</h1>
        <p className="text-gray-500 text-sm">{formatTanggal(new Date())}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card Bahan Baku — clickable */}
        {!isSpv && (
        <button
          onClick={() => setShowModalBahan(true)}
          className="card text-left hover:shadow-md hover:border-amber-200 transition-all active:scale-95 border border-transparent"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bahanKritis.length > 0 ? "bg-red-100" : "bg-amber-100"}`}>
              <Package size={16} className={bahanKritis.length > 0 ? "text-red-500" : "text-amber-600"} />
            </div>
            <p className="text-xs text-gray-500">Bahan Baku</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{allBahan.length}</p>
          {bahanKritis.length > 0 ? (
            <p className="text-xs font-semibold text-red-500 flex items-center gap-1 mt-0.5">
              <AlertTriangle size={11} />
              {bahanKritis.length} kritis
            </p>
          ) : (
            <p className="text-xs text-gray-400">semua aman</p>
          )}
        </button>
        )}
        {!isSpv && (
        <button
          onClick={() => setShowModalBatch(true)}
          className="card text-left hover:shadow-md hover:border-blue-200 transition-all active:scale-95 border border-transparent"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <ChefHat size={16} className="text-blue-600" />
            </div>
            <p className="text-xs text-gray-500">Batch Adonan Aktif</p>
          </div>
          <div className="flex items-center justify-between group">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Direndam</p>
              <p className="text-xl font-bold text-blue-700">{formatAngka(totalDirendam)} pcs</p>
            </div>
            <ArrowUpRight size={16} className="text-blue-300 group-hover:text-blue-500 transition-colors" />
          </div>
        </button>
        )}
        {!isPic && !isSpv && (
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Snowflake size={16} className="text-indigo-600" />
            </div>
            <p className="text-xs text-gray-500">Total SKU</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stokProduk.length}</p>
          <p className="text-xs text-gray-400">produk aktif</p>
        </div>
        )}
        {!isPic && !isSpv && (
        <div className="card col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Truck size={16} className="text-green-600" />
            </div>
            <p className="text-xs text-gray-500">Kiriman Hari Ini</p>
          </div>
          <div className="space-y-1.5">
            <button
              onClick={() => setShowModalKiriman("cane")}
              className="w-full flex items-center justify-between group hover:bg-amber-50 rounded-lg px-2 py-1.5 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">Cane RawtheR</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-amber-700">{formatAngka(canePcs)} pcs</span>
                <ArrowUpRight size={13} className="text-amber-400 group-hover:text-amber-600 transition-colors" />
              </div>
            </button>
            <button
              onClick={() => setShowModalKiriman("mehana")}
              className="w-full flex items-center justify-between group hover:bg-blue-50 rounded-lg px-2 py-1.5 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">Mehana</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-blue-700">{formatAngka(mehanaPcs)} pcs</span>
                <ArrowUpRight size={13} className="text-blue-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Batch Produksi Berjalan */}
        {!isSpv && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ChefHat size={16} className="text-amber-500" />
            Batch Adonan
          </h2>
          {batchBerjalan.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Tidak ada batch aktif</p>
          ) : (
            <div className="space-y-2">
              {batchBerjalan.map((b) => {
                const sku      = b.produk_sku as { nama_brand: string; varian: string };
                const namaUser = (b.users as { nama: string })?.nama ?? "—";
                return (
                  <div key={b.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-medium text-sm text-gray-800 leading-snug">
                        {sku?.nama_brand} - {sku?.varian}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span className="font-semibold text-amber-600">{formatAngka(b.jumlah_pack_rencana)} kg</span>
                        <span className="text-gray-400"> — {namaUser}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTanggal(b.tanggal_produksi)}</p>
                    </div>
                    <span className={statusClass[b.status]}>{statusLabels[b.status]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Stock Roti Cane */}
        {!isPic && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Snowflake size={16} className="text-indigo-500" />
            Stock Roti Cane
          </h2>
          <div className="space-y-4">
            {(isSpv ? (["cane"] as const) : (["cane", "mehana"] as const)).map((brand) => {
              const brandLabel = brand === "cane" ? "Cane RawtheR" : "Mehana Boga Utama";
              const CANE_ORDER = ["Original", "Melted Choco", "Grated Cheese", "Whole Wheat"];
              const MEHANA_ORDER = ["Original", "Cokelat", "Keju"];
              const varianOrder = brand === "cane" ? CANE_ORDER : MEHANA_ORDER;
              const items = stokProduk
                .filter((p) => p.brand === brand)
                .sort((a, b) => {
                  // Mehana: isi_per_pack=5 group dulu, lalu isi_per_pack=10
                  // Cane: semua 1 pack size, jangan sort by isi_per_pack
                  if (brand === "mehana" && a.isi_per_pack !== b.isi_per_pack) return a.isi_per_pack - b.isi_per_pack;
                  const ai = varianOrder.indexOf(a.varian);
                  const bi = varianOrder.indexOf(b.varian);
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                });
              if (items.length === 0) return null;
              const renderRow = (p: StokProduk) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700">
                    {p.varian}
                    {brand === "mehana" && <span className="text-gray-400"> Isi {p.isi_per_pack} Pcs</span>}
                  </p>
                  <span className={`text-sm font-bold tabular-nums ${p.stok_saat_ini === 0 ? "text-gray-400" : "text-gray-800"}`}>
                    {formatAngka(p.stok_saat_ini)} pack
                  </span>
                </div>
              );
              return (
                <div key={brand}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${brand === "cane" ? "text-amber-600" : "text-blue-600"}`}>
                    {brandLabel}
                  </p>
                  {brand === "cane" ? (
                    <div className="space-y-1">{items.map(renderRow)}</div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-400 mb-1">Isi 5</p>
                      <div className="space-y-1">{items.filter((p) => p.isi_per_pack === 5).map(renderRow)}</div>
                      <div className="border-t border-gray-100 my-2" />
                      <p className="text-xs font-semibold text-gray-400 mb-1">Isi 10</p>
                      <div className="space-y-1">{items.filter((p) => p.isi_per_pack === 10).map(renderRow)}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Modal Batch Adonan Aktif - Detail Rendam */}
      {showModalBatch && (() => {
        const sumPcs = (brandKey: "cane" | "mehana", varian: string) =>
          batchRendam
            .filter((b) => brandKeyOf(b) === brandKey && b.produk_sku?.varian === varian)
            .reduce((s, b) => s + (b.jumlah_pack_adonan ?? 0), 0);

        const caneRows    = CANE_VARIANTS_ORD.map((v)   => ({ label: v, pcs: sumPcs("cane",   v) }));
        const mehanaRows  = MEHANA_VARIANTS_ORD.map((v) => ({ label: v, pcs: sumPcs("mehana", v) }));
        const subCane     = caneRows.reduce((s, r)   => s + r.pcs, 0);
        const subMehana   = mehanaRows.reduce((s, r) => s + r.pcs, 0);
        const grandTotal  = subCane + subMehana;

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-blue-100 bg-blue-50 rounded-t-2xl">
                <div>
                  <p className="font-bold text-sm text-blue-700">BATCH ADONAN AKTIF</p>
                  <p className="text-xs text-gray-500 mt-0.5">Detail Rendam</p>
                </div>
                <button onClick={() => setShowModalBatch(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {grandTotal === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">Tidak ada batch aktif di tahap Rendam</p>
                ) : (
                  <>
                    {/* Cane */}
                    <div>
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Cane RawtheR</p>
                      <div className="space-y-1">
                        {caneRows.map((r) => (
                          <div key={r.label} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                            <span className="text-sm text-gray-700">{r.label}</span>
                            <span className={`text-sm font-semibold tabular-nums ${r.pcs === 0 ? "text-gray-300" : "text-gray-800"}`}>{r.pcs} pcs</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5">
                          <span className="text-xs font-bold text-gray-500">Subtotal Cane</span>
                          <span className="text-sm font-bold text-amber-700">{subCane} pcs</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Mehana */}
                    <div>
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Mehana Boga Utama</p>
                      <div className="space-y-1">
                        {mehanaRows.map((r) => (
                          <div key={r.label} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                            <span className="text-sm text-gray-700">{r.label}</span>
                            <span className={`text-sm font-semibold tabular-nums ${r.pcs === 0 ? "text-gray-300" : "text-gray-800"}`}>{r.pcs} pcs</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1.5">
                          <span className="text-xs font-bold text-gray-500">Subtotal Mehana</span>
                          <span className="text-sm font-bold text-blue-700">{subMehana} pcs</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t-2 border-gray-200">
                      <span className="text-sm font-bold text-gray-700">TOTAL BATCH AKTIF</span>
                      <span className="text-base font-bold text-gray-900">{grandTotal} pcs</span>
                    </div>
                  </>
                )}
              </div>
              <div className="px-5 pb-5">
                <button onClick={() => setShowModalBatch(false)} className="btn-secondary w-full">Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Kiriman Hari Ini */}
      {showModalKiriman && (() => {
        const isCane      = showModalKiriman === "cane";
        const brandLabel  = isCane ? "Cane RawtheR" : "Mehana";
        const colorClass  = isCane ? "text-amber-600" : "text-blue-600";
        const headerClass = isCane ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100";

        // Build rows
        type KirimanRow = { label: string; pack: number; pcs: number };
        let rows: KirimanRow[] = [];

        if (isCane) {
          rows = CANE_VARIANTS_ORD.map((v) => {
            const pack = pengirimanHariIni
              .filter((p) => p.produk_sku?.brand === "cane" && p.produk_sku?.varian === v)
              .reduce((s, p) => s + p.jumlah_pack, 0);
            const isi  = stokProduk.find((s) => s.brand === "cane" && s.varian === v)?.isi_per_pack ?? 5;
            return { label: v, pack, pcs: pack * isi };
          });
        } else {
          [5, 10].forEach((isi) => {
            MEHANA_VARIANTS_ORD.forEach((v) => {
              const pack = pengirimanHariIni
                .filter((p) => p.produk_sku?.brand === "mehana" && p.produk_sku?.varian === v && p.produk_sku?.isi_per_pack === isi)
                .reduce((s, p) => s + p.jumlah_pack, 0);
              rows.push({ label: `${v} Isi ${isi}`, pack, pcs: pack * isi });
            });
          });
        }

        const totalPack = rows.reduce((s, r) => s + r.pack, 0);
        const totalPcs  = rows.reduce((s, r) => s + r.pcs, 0);

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col">
              <div className={`flex items-center justify-between px-5 py-4 border-b rounded-t-2xl ${headerClass}`}>
                <div>
                  <p className={`font-bold text-sm ${colorClass}`}>KIRIMAN {brandLabel.toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Hari Ini</p>
                </div>
                <button onClick={() => setShowModalKiriman(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 space-y-1">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{r.label}</span>
                    <span className="text-sm tabular-nums text-gray-600">
                      <span className={`font-semibold ${r.pack === 0 ? "text-gray-300" : "text-gray-800"}`}>{r.pack} pack</span>
                      <span className="text-gray-400 ml-1">({r.pcs} pcs)</span>
                    </span>
                  </div>
                ))}
                <div className={`flex items-center justify-between pt-2.5 mt-1 border-t-2 ${isCane ? "border-amber-200" : "border-blue-200"}`}>
                  <span className="text-sm font-bold text-gray-700">Total</span>
                  <span className="text-sm tabular-nums">
                    <span className={`font-bold ${isCane ? "text-amber-700" : "text-blue-700"}`}>{totalPack} pack</span>
                    <span className="text-gray-500 ml-1">({totalPcs} pcs)</span>
                  </span>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button onClick={() => setShowModalKiriman(null)} className="btn-secondary w-full">Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Stok Bahan Baku */}
      {showModalBahan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-amber-500" />
                <h2 className="font-bold text-gray-800">Stok Bahan Baku</h2>
                {bahanKritis.length > 0 && (
                  <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {bahanKritis.length} kritis
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowModalBahan(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* List bahan — kritis di atas */}
            <div className="overflow-y-auto p-4 space-y-2">
              {/* Kritis dulu */}
              {bahanKritis.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider px-1">⚠ Stok Kritis</p>
                  {allBahan
                    .filter((b) => b.stok_saat_ini <= b.stok_minimum)
                    .map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200">
                        <div>
                          <p className="text-sm font-semibold text-red-700">{b.nama}</p>
                          <p className="text-xs text-red-400">Min: {formatAngka(b.stok_minimum)} {b.satuan}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-red-600">{formatAngka(b.stok_saat_ini)}</p>
                          <p className="text-xs text-red-400">{b.satuan}</p>
                        </div>
                      </div>
                    ))}
                  <div className="border-t border-gray-100 my-2" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">✓ Stok Normal</p>
                </>
              )}

              {/* Normal */}
              {allBahan
                .filter((b) => b.stok_saat_ini > b.stok_minimum)
                .map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.nama}</p>
                      <p className="text-xs text-gray-400">Min: {formatAngka(b.stok_minimum)} {b.satuan}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-700">{formatAngka(b.stok_saat_ini)}</p>
                      <p className="text-xs text-gray-400">{b.satuan}</p>
                    </div>
                  </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setShowModalBahan(false)}
                className="btn-secondary w-full"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
