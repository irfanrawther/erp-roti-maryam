"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";

// Rentang audit
const FROM = "2026-07-01";
const TO   = "2026-07-03";

interface BatchRow {
  id: string;
  status: string;
  tanggal_produksi: string;
  created_at: string;
  produk_sku: { nama_brand: string; varian: string } | null;
}
interface PackingRow {
  id: string;
  batch_produksi_id: string | null;
  brand: string;
  varian: string;
  tanggal: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  adonan: "Adonan", bikin: "Rendam", packing: "Packing", freezer: "Freezer", selesai: "Selesai (Packing)",
};

// tanggal WIB (YYYY-MM-DD) dari timestamptz
function wibDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
// datetime WIB lengkap
function wibFull(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DebugTanggalPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [packing, setPacking] = useState<PackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUserSession();
    setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true);
    const [bRes, pRes] = await Promise.all([
      supabase.from("batch_produksi")
        .select("id, status, tanggal_produksi, created_at, produk_sku:produk_sku_id(nama_brand, varian)")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("packing_input")
        .select("id, batch_produksi_id, brand, varian, tanggal, created_at")
        .order("created_at", { ascending: false }).limit(500),
    ]);
    setBatches((bRes.data as unknown as BatchRow[]) ?? []);
    setPacking((pRes.data as unknown as PackingRow[]) ?? []);
    setLoading(false);
  }

  // Filter: tanggal_produksi ATAU created_at (WIB) berada dalam rentang audit
  const inRange = (b: BatchRow) => {
    const tp = b.tanggal_produksi;
    const cw = wibDate(b.created_at);
    const hit = (d: string) => d >= FROM && d <= TO;
    return hit(tp) || hit(cw);
  };
  const rows = batches.filter(inRange);

  const suspiciousCount = rows.filter((b) => b.tanggal_produksi !== wibDate(b.created_at)).length;

  // Inkonsistensi: packing_input.tanggal vs batch.tanggal_produksi
  const inkonsisten = packing
    .map((p) => {
      const b = batches.find((x) => x.id === p.batch_produksi_id);
      if (!b) return null;
      if (!inRange(b) && !(p.tanggal >= FROM && p.tanggal <= TO)) return null;
      const beda = p.tanggal !== b.tanggal_produksi;
      return { p, b, beda };
    })
    .filter((x): x is { p: PackingRow; b: BatchRow; beda: boolean } => x !== null && x.beda);

  if (!user) return null;

  return (
    <div className="p-4 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-800">🔍 Debug Tanggal Produksi</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Audit read-only rentang <b>{FROM}</b> s/d <b>{TO}</b>. Tidak ada data yang diubah.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400">Memuat…</p>
      ) : (
        <>
          {/* Ringkasan */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-gray-100 px-3 py-1.5">Total batch: <b>{rows.length}</b></span>
            <span className="rounded-lg bg-amber-100 text-amber-700 px-3 py-1.5">⚠️ Beda hari (tanggal vs input): <b>{suspiciousCount}</b></span>
            <span className="rounded-lg bg-red-100 text-red-700 px-3 py-1.5">⚠️ Packing tidak konsisten: <b>{inkonsisten.length}</b></span>
          </div>

          {/* Tabel batch */}
          <div className="rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Stage</th>
                  <th className="px-3 py-2 font-semibold">Brand — Varian</th>
                  <th className="px-3 py-2 font-semibold">Tanggal Produksi</th>
                  <th className="px-3 py-2 font-semibold">Diinput (WIB)</th>
                  <th className="px-3 py-2 font-semibold">Flag</th>
                  <th className="px-3 py-2 font-semibold text-[10px] text-gray-300">batch id</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Tidak ada data di rentang ini</td></tr>
                ) : rows.map((b) => {
                  const cw = wibDate(b.created_at);
                  const suspect = b.tanggal_produksi !== cw;
                  return (
                    <tr key={b.id} className={`border-t border-gray-50 ${suspect ? "bg-amber-50/50" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap">{STATUS_LABEL[b.status] ?? b.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{b.produk_sku?.nama_brand} — {b.produk_sku?.varian}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-700">{b.tanggal_produksi}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{wibFull(b.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {suspect
                          ? <span className="text-amber-700 font-semibold">⚠️ MENCURIGAKAN (input {cw})</span>
                          : <span className="text-green-600">✓ oke</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[10px] text-gray-300 font-mono">{b.id.slice(0, 8)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Inkonsistensi packing_input */}
          <div>
            <h2 className="font-bold text-gray-800 mb-2">Cek Konsistensi Packing Input vs Batch</h2>
            {inkonsisten.length === 0 ? (
              <p className="text-sm text-green-600">✓ Semua packing_input konsisten dengan tanggal_produksi batch induknya.</p>
            ) : (
              <div className="rounded-xl border border-red-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 text-left text-red-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Brand — Varian</th>
                      <th className="px-3 py-2 font-semibold">Batch tanggal_produksi</th>
                      <th className="px-3 py-2 font-semibold">Packing.tanggal</th>
                      <th className="px-3 py-2 font-semibold">Packing diinput (WIB)</th>
                      <th className="px-3 py-2 font-semibold text-[10px] text-gray-300">batch id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inkonsisten.map(({ p, b }) => (
                      <tr key={p.id} className="border-t border-red-50 bg-red-50/40">
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{b.produk_sku?.nama_brand} — {b.produk_sku?.varian}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-700">{b.tanggal_produksi}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-semibold text-red-600">{p.tanggal}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{wibFull(p.created_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[10px] text-gray-300 font-mono">{b.id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit packing_input: input lewat tengah malam */}
          {(() => {
            const piRows = packing
              .filter((p) => {
                const cw = wibDate(p.created_at);
                const hit = (d: string) => d >= FROM && d <= TO;
                return hit(p.tanggal) || hit(cw);
              })
              .sort((a, b) => b.created_at.localeCompare(a.created_at));
            const bedaHari = piRows.filter((p) => p.tanggal !== wibDate(p.created_at)).length;
            return (
              <div>
                <h2 className="font-bold text-gray-800 mb-1">Audit Packing Input (input vs tanggal produksi)</h2>
                <p className="text-xs text-gray-500 mb-2">
                  {bedaHari} baris diinput di hari berbeda dari tanggal produksinya (biasanya input lewat tengah malam).
                  Ini <b>normal untuk Opsi B</b> — cek saja apakah tanggal produksinya sudah benar.
                </p>
                <div className="rounded-xl border border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Brand — Varian</th>
                        <th className="px-3 py-2 font-semibold">Tanggal Produksi</th>
                        <th className="px-3 py-2 font-semibold">Diinput (WIB)</th>
                        <th className="px-3 py-2 font-semibold">Flag</th>
                        <th className="px-3 py-2 font-semibold text-[10px] text-gray-300">batch id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {piRows.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Tidak ada data</td></tr>
                      ) : piRows.map((p) => {
                        const cw = wibDate(p.created_at);
                        const beda = p.tanggal !== cw;
                        return (
                          <tr key={p.id} className={`border-t border-gray-50 ${beda ? "bg-amber-50/50" : ""}`}>
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{p.brand} — {p.varian}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-700">{p.tanggal}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-500">{wibFull(p.created_at)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {beda
                                ? <span className="text-amber-700 font-semibold">⚠️ beda hari (input {cw})</span>
                                : <span className="text-green-600">✓ sama</span>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-[10px] text-gray-300 font-mono">{p.batch_produksi_id?.slice(0, 8) ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            Halaman audit sementara. Belum ada perubahan data. Beri tahu baris mana (batch id) yang perlu dikoreksi dan ke tanggal berapa.
          </p>
        </>
      )}
    </div>
  );
}
