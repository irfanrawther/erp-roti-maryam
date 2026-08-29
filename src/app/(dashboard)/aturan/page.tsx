"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, type UserSession } from "@/lib/auth";
import { homeRoute } from "@/lib/permissions";
import { invalidateAturanCache } from "@/lib/aturan";
import { SlidersHorizontal, Save, RotateCcw, AlertCircle, CheckCircle2, History } from "lucide-react";
import JsonEditor from "./JsonEditor";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

interface ConfigRow {
  id: string; jalur: string; kunci: string; label: string | null; nilai: Json;
  updated_by: string | null; updated_at: string;
}
interface PelanggaranRow {
  id: string; jalur: string; nomor: number | null; nama_pelanggaran: string;
  poin: number; tier: string; jenis: string; is_aktif: boolean;
  is_kebersihan: boolean; is_kolektif: boolean; eskalasi_poin: number | null; catatan: string | null;
}

const JALUR_TAB = [
  { key: "global",   label: "Global" },
  { key: "training", label: "Training" },
  { key: "staff",    label: "Staff" },
  { key: "spv",      label: "SPV" },
];
const PELANGGARAN_TAB = [
  { key: "training",   label: "Training (30)" },
  { key: "staff",      label: "Staff (30)" },
  { key: "spv",        label: "SPV (27)" },
  { key: "spv_khusus", label: "Khusus SPV (13)" },
  { key: "tier4",      label: "Tier 4 — PHK" },
];

function tglWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AturanPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"config" | "pelanggaran">("config");
  const [jalur, setJalur] = useState("training");
  const [pelJalur, setPelJalur] = useState("training");
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [pelanggaran, setPelanggaran] = useState<PelanggaranRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Json>>({});
  const [pelDraft, setPelDraft] = useState<Record<string, Partial<PelanggaranRow>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !canAccessAdmin(u.role)) { router.replace(homeRoute(u)); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("aturan_config").select("id, jalur, kunci, label, nilai, updated_by, updated_at").order("jalur").order("kunci"),
      supabase.from("master_pelanggaran")
        .select("id, jalur, nomor, nama_pelanggaran, poin, tier, jenis, is_aktif, is_kebersihan, is_kolektif, eskalasi_poin, catatan")
        .neq("jalur", "legacy").order("jalur").order("nomor"),
    ]);
    setConfigs((c.data as ConfigRow[]) ?? []);
    setPelanggaran((p.data as PelanggaranRow[]) ?? []);
    setDraft({}); setPelDraft({});
    setLoading(false);
  }, []);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(""), 3500); }

  async function simpanConfig(row: ConfigRow) {
    const next = draft[row.id];
    if (next === undefined) return;
    setBusy(row.id);
    // Audit trail: catat nilai lama & baru
    await supabase.from("aturan_config_log").insert({
      config_id: row.id, jalur: row.jalur, kunci: row.kunci,
      nilai_lama: row.nilai, nilai_baru: next, diubah_oleh: user?.nama ?? "",
    });
    const { error } = await supabase.from("aturan_config")
      .update({ nilai: next, updated_by: user?.nama ?? "", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusy(null);
    if (error) { showToast("Gagal menyimpan: " + error.message); return; }
    invalidateAturanCache();
    await fetchAll();
    showToast(`Tersimpan — ${row.label ?? row.kunci}`);
  }

  async function simpanPelanggaran(row: PelanggaranRow) {
    const d = pelDraft[row.id];
    if (!d) return;
    setBusy(row.id);
    const { error } = await supabase.from("master_pelanggaran").update(d).eq("id", row.id);
    setBusy(null);
    if (error) { showToast("Gagal menyimpan: " + error.message); return; }
    await fetchAll();
    showToast(`Tersimpan — ${row.nama_pelanggaran.slice(0, 40)}…`);
  }

  const configsJalur = configs.filter((c) => c.jalur === jalur);
  const pelJalurRows = pelanggaran.filter((p) => p.jalur === pelJalur);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={20} className="text-amber-500" />
        <h1 className="text-xl font-bold text-gray-800">Aturan & Nominal</h1>
      </div>
      <p className="text-sm text-gray-500">
        Semua angka aturan (denda, poin, threshold SP, vesting, tunjangan, jam tugas SPV) disimpan sebagai data.
        Perubahan langsung berlaku tanpa perlu deploy ulang, dan tidak memerlukan penandatanganan ulang dokumen
        untuk hal-hal yang memang boleh berubah sewaktu-waktu.
      </p>

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {([["config", "Nominal & Aturan"], ["pelanggaran", "Tabel Pelanggaran"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === k ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {toast && (
        <div className="flex items-center gap-2 text-sm bg-green-50 text-green-700 rounded-xl px-3 py-2">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400 text-center py-8">Memuat…</p> : tab === "config" ? (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {JALUR_TAB.map((j) => (
              <button key={j.key} onClick={() => setJalur(j.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${jalur === j.key ? "bg-gray-800 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {j.label}
              </button>
            ))}
          </div>

          {configsJalur.length === 0 ? (
            <div className="card text-center py-8">
              <AlertCircle size={26} className="mx-auto text-amber-400 mb-2" />
              <p className="text-sm text-gray-500">Belum ada config untuk jalur ini. Jalankan migrasi 062 dulu.</p>
            </div>
          ) : configsJalur.map((c) => {
            const nilai = (draft[c.id] ?? c.nilai) as Json;
            const berubah = draft[c.id] !== undefined;
            return (
              <div key={c.id} className="card space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800">{c.label ?? c.kunci}</p>
                    <p className="text-[11px] text-gray-400">
                      <code className="bg-gray-100 px-1 rounded">{c.jalur}.{c.kunci}</code>
                      {c.updated_by && <> · terakhir diubah {c.updated_by}, {tglWaktu(c.updated_at)}</>}
                    </p>
                  </div>
                  {berubah && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setDraft((d) => { const n = { ...d }; delete n[c.id]; return n; })}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" title="Batalkan perubahan">
                        <RotateCcw size={14} />
                      </button>
                      <button onClick={() => simpanConfig(c)} disabled={busy === c.id}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                        <Save size={12} /> {busy === c.id ? "…" : "Simpan"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="pt-1">
                  <JsonEditor value={nilai} onChange={(next) => setDraft((d) => ({ ...d, [c.id]: next }))} />
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {PELANGGARAN_TAB.map((j) => (
              <button key={j.key} onClick={() => setPelJalur(j.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${pelJalur === j.key ? "bg-gray-800 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {j.label}
              </button>
            ))}
          </div>

          <div className="card space-y-1.5">
            {pelJalurRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Belum ada data. Jalankan migrasi 062 dulu.</p>
            ) : pelJalurRows.map((p) => {
              const d = pelDraft[p.id] ?? {};
              const poin = d.poin ?? p.poin;
              const aktif = d.is_aktif ?? p.is_aktif;
              const berubah = Object.keys(d).length > 0;
              return (
                <div key={p.id} className={`rounded-xl border p-2.5 ${p.catatan?.startsWith("PENDING REVISI") ? "border-amber-200 bg-amber-50/50" : "border-gray-100"}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-bold text-gray-400 w-5 shrink-0 pt-0.5">{p.nomor}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{p.nama_pelanggaran}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{p.tier}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.jenis === "otomatis" ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500"}`}>{p.jenis}</span>
                        {p.is_kebersihan && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 font-medium">kebersihan</span>}
                        {p.is_kolektif && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">kolektif</span>}
                        {p.eskalasi_poin != null && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium">eskalasi → {p.eskalasi_poin}</span>}
                      </div>
                      {p.catatan && (
                        <p className={`text-[10px] mt-1 ${p.catatan.startsWith("PENDING REVISI") ? "text-amber-700 font-semibold" : "text-gray-400 italic"}`}>{p.catatan}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.5" value={poin}
                          onChange={(e) => setPelDraft((s) => ({ ...s, [p.id]: { ...s[p.id], poin: parseFloat(e.target.value) || 0 } }))}
                          className="input py-1 text-sm w-16 text-right" />
                        <span className="text-[10px] text-gray-400">poin</span>
                      </div>
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={aktif} className="w-3 h-3 accent-amber-500"
                          onChange={(e) => setPelDraft((s) => ({ ...s, [p.id]: { ...s[p.id], is_aktif: e.target.checked } }))} />
                        aktif
                      </label>
                      {berubah && (
                        <button onClick={() => simpanPelanggaran(p)} disabled={busy === p.id}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                          {busy === p.id ? "…" : "Simpan"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pelJalur === "spv" && (
            <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5">
              <History size={15} className="shrink-0 mt-0.5" />
              <span>
                Tiga item bertanda <b>PENDING REVISI</b> (No. 20, 22, 24) masih menyebut &quot;SPV&quot; sebagai subjek dan
                menunggu konfirmasi Anda untuk diubah menjadi &quot;Manajer Operasional&quot;. Nama pelanggaran bisa
                diubah langsung di database, atau beri tahu saya untuk menyiapkan migrasinya.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
