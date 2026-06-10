"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { formatAngka, formatTanggalWaktu, formatTanggal } from "@/lib/utils";
import { Plus, Minus, X, History, Check, FlaskConical, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface BahanBaku {
  id: string; nama: string; satuan: string;
  stok_saat_ini: number; stok_minimum: number;
}
interface Riwayat {
  id: string; tipe: "masuk" | "keluar"; jumlah: number; satuan: string;
  tanggal: string; created_at: string;
  bahan_baku: { nama: string }; users: { nama: string };
}
interface RiwayatPemakaian {
  id: string; jumlah_digunakan: number; satuan: string; created_at: string;
  bahan_baku: { nama: string };
  batch_produksi: { tanggal_produksi: string; produk_sku: { nama_brand: string; varian: string }; };
  users: { nama: string };
}
interface ProsesBikinRow {
  id: string; jumlah: number; satuan: string; keterangan: string; created_at: string;
  bahan_baku: { nama: string };
  users: { nama: string };
}

// Unified entry untuk Riwayat Pemakaian (dari kedua sumber)
interface PemakaianEntry {
  id: string;
  sumber: "produksi" | "proses_bikin";
  namaBahan: string;
  jumlah: number;
  satuan: string;
  created_at: string;
  label: string;       // e.g. "Cane Original" atau "Produksi Batch"
  tanggal?: string;
  namaUser: string;
}

// Label mapping untuk proses bikin brand+varian key
const PROSES_BIKIN_LABEL: Record<string, Record<string, string>> = {
  cane:   { original:"Cane Original", melted_choco:"Cane Melted Choco", grated_cheese:"Cane Grated Cheese", wholewheat:"Cane Whole Wheat" },
  mehana: { original:"Mehana Original", cokelat:"Mehana Cokelat", keju:"Mehana Keju" },
};

const SATUAN_OPTIONS = ["Kg", "Liter", "Pcs"];
const URUTAN_BAHAN = [
  "Terigu","Minyak","Garam","Gula","Air",
  "Margarine Menara","Mesis Innova","Keju Calf",
  "Margarine Blue Band","Mesis Tulip","Keju Kraft Martabak",
  "Baking Powder","Telur","Tepung Gandum","Butter Hollmann",
];
function sortBahan<T extends { nama: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ia = URUTAN_BAHAN.indexOf(a.nama), ib = URUTAN_BAHAN.indexOf(b.nama);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

// ── Datetime helpers (local timezone) ────────────────────────
// Format a Date → "YYYY-MM-DDTHH:MM:SS" in LOCAL timezone
function localDT(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Start of a given local date (00:00:00)
function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
// End of a given local date (23:59:59)
function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}
// Offset a date by N days
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// Convert a UTC ISO string from Supabase → local "YYYY-MM-DDTHH:MM:SS"
function utcToLocal(utcStr: string): string {
  return localDT(new Date(utcStr));
}

// "YYYY-MM-DD" from a local Date
function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "custom";

// Compute start/end local datetime strings for each preset (needs "now")
function computeRange(preset: DatePreset, now: Date, customStart: string, customEnd: string): { start: string; end: string } {
  switch (preset) {
    case "today":
      return { start: localDT(startOfDay(now)), end: localDT(now) };
    case "yesterday": {
      const yest = addDays(now, -1);
      return { start: localDT(startOfDay(yest)), end: localDT(endOfDay(yest)) };
    }
    case "7days":
      return { start: localDT(startOfDay(addDays(now, -6))), end: localDT(now) };
    case "30days":
      return { start: localDT(startOfDay(addDays(now, -29))), end: localDT(now) };
    case "custom":
      return {
        start: customStart ? `${customStart}T00:00:00` : localDT(startOfDay(now)),
        end:   customEnd   ? `${customEnd}T23:59:59`   : localDT(endOfDay(now)),
      };
  }
}

type ActiveTab = "stok" | "riwayat" | "pemakaian";

// ── Page ─────────────────────────────────────────────────────
export default function BahanBakuPage() {
  const user = getUserSession();

  const [bahanList,        setBahanList]        = useState<BahanBaku[]>([]);
  const [riwayat,           setRiwayat]           = useState<Riwayat[]>([]);
  const [riwayatPemakaian,  setRiwayatPemakaian]  = useState<RiwayatPemakaian[]>([]);
  const [riwayatProsesBikin,setRiwayatProsesBikin] = useState<ProsesBikinRow[]>([]);
  const [activeTab,        setActiveTab]        = useState<ActiveTab>("stok");
  const [filterRiwayatBahan,   setFilterRiwayatBahan]   = useState("");
  const [filterPemakaianBahan, setFilterPemakaianBahan] = useState("");

  // Date filter state
  const [preset,      setPreset]      = useState<DatePreset>("today");
  const [customStart, setCustomStart] = useState(localDateStr(new Date()));
  const [customEnd,   setCustomEnd]   = useState(localDateStr(new Date()));

  // Real-time clock — ticks every second
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch ────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const ch = supabase.channel("bahan-baku-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"penerimaan_bahan_baku" }, fetchData)
      .on("postgres_changes", { event:"*", schema:"public", table:"bahan_baku" }, fetchData)
      .on("postgres_changes", { event:"*", schema:"public", table:"penggunaan_bahan" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchData() {
    const [bahanRes, riwayatRes, pemakaianRes, prosesBikinRes] = await Promise.all([
      supabase.from("bahan_baku").select("id,nama,satuan,stok_saat_ini,stok_minimum").eq("aktif", true),
      // Riwayat Penerimaan/Pengurangan: exclude semua activity produksi
      supabase.from("penerimaan_bahan_baku")
        .select("id,tipe,jumlah,satuan,tanggal,created_at,keterangan,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
        .not("keterangan","like","Produksi batch%")
        .not("keterangan","like","Restore dari%")
        .not("keterangan","like","proses_bikin::%")
        .order("created_at", { ascending: false }).limit(500),
      // Riwayat Pemakaian sumber 1: Produksi Adonan (penggunaan_bahan)
      supabase.from("penggunaan_bahan")
        .select(`id,jumlah_digunakan,satuan,created_at,
          bahan_baku:bahan_baku_id(nama),
          batch_produksi:batch_produksi_id(tanggal_produksi,produk_sku:produk_sku_id(nama_brand,varian)),
          users:created_by(nama)`)
        .order("created_at", { ascending: false }).limit(500),
      // Riwayat Pemakaian sumber 2: Proses Bikin (penerimaan_bahan_baku tipe keluar proses_bikin)
      supabase.from("penerimaan_bahan_baku")
        .select("id,jumlah,satuan,keterangan,created_at,bahan_baku:bahan_baku_id(nama),users:created_by(nama)")
        .like("keterangan","proses_bikin::%")
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (bahanRes.data)       setBahanList(sortBahan(bahanRes.data));
    if (riwayatRes.data)     setRiwayat(riwayatRes.data as unknown as Riwayat[]);
    if (pemakaianRes.data)   setRiwayatPemakaian(pemakaianRes.data as unknown as RiwayatPemakaian[]);
    if (prosesBikinRes.data) setRiwayatProsesBikin(prosesBikinRes.data as unknown as ProsesBikinRow[]);
  }

  async function submitTransaksi(bahanId: string, tipe: "masuk" | "keluar", jumlah: number, satuan: string): Promise<boolean> {
    if (!user) return false;
    const { error } = await supabase.from("penerimaan_bahan_baku").insert({
      bahan_baku_id: bahanId, jumlah, satuan, tipe,
      tanggal: localDateStr(new Date()), created_by: user.id,
    });
    if (!error) fetchData();
    return !error;
  }

  // ── Derived filtered lists (recomputed every second for real-time presets) ──
  const { start, end } = computeRange(preset, now, customStart, customEnd);

  function inRange(createdAt: string) {
    const localTs = utcToLocal(createdAt);
    return localTs >= start && localTs <= end;
  }

  const riwayatFiltered = riwayat.filter((r) =>
    inRange(r.created_at) &&
    (!filterRiwayatBahan || r.bahan_baku?.nama?.toLowerCase().includes(filterRiwayatBahan.toLowerCase()))
  );

  // ── Merge Produksi Adonan + Proses Bikin → unified PemakaianEntry ──
  const allPemakaian: PemakaianEntry[] = [
    // Sumber 1: Produksi Adonan (penggunaan_bahan)
    ...riwayatPemakaian.map((r): PemakaianEntry => {
      const sku    = r.batch_produksi?.produk_sku as { nama_brand: string; varian: string } | null;
      const brand  = sku?.nama_brand ?? "";
      const varian = sku?.varian ?? "";
      return {
        id:         `prod-${r.id}`,
        sumber:     "produksi",
        namaBahan:  r.bahan_baku?.nama ?? "?",
        jumlah:     r.jumlah_digunakan,
        satuan:     r.satuan,
        created_at: r.created_at,
        label:      [brand, varian].filter(Boolean).join(" ") || "Produksi Adonan",
        tanggal:    r.batch_produksi?.tanggal_produksi,
        namaUser:   r.users?.nama ?? "",
      };
    }),
    // Sumber 2: Proses Bikin (penerimaan_bahan_baku proses_bikin::)
    ...riwayatProsesBikin.map((r): PemakaianEntry => {
      let label = "Proses Bikin";
      try {
        const json = JSON.parse(r.keterangan.replace("proses_bikin::", ""));
        const brandLabels = PROSES_BIKIN_LABEL[json.brandKey] ?? {};
        label = brandLabels[json.varianKey] ?? `Proses Bikin ${json.varianKey ?? ""}`;
      } catch {}
      return {
        id:         `pb-${r.id}`,
        sumber:     "proses_bikin",
        namaBahan:  r.bahan_baku?.nama ?? "?",
        jumlah:     r.jumlah,
        satuan:     r.satuan,
        created_at: r.created_at,
        label,
        namaUser:   r.users?.nama ?? "",
      };
    }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)); // terbaru di atas

  const pemakaianFiltered = allPemakaian.filter((r) =>
    inRange(r.created_at) &&
    (!filterPemakaianBahan || r.namaBahan.toLowerCase().includes(filterPemakaianBahan.toLowerCase()))
  );

  function handlePreset(p: DatePreset) {
    setPreset(p);
    if (p !== "custom") {
      setCustomStart(localDateStr(new Date()));
      setCustomEnd(localDateStr(new Date()));
    }
  }

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "stok",      label: "Stok Saat Ini" },
    { key: "riwayat",   label: "Riwayat Penerimaan/Pengurangan" },
    { key: "pemakaian", label: "Riwayat Pemakaian" },
  ];

  // Human-readable range label
  function rangeLabel() {
    const fmt = (dt: string) => {
      const d = new Date(dt);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getDate())} ${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    if (preset === "yesterday") {
      const yest = addDays(now, -1);
      return `${localDateStr(yest)} 00:00:00 s/d 23:59:59`;
    }
    if (preset === "custom") return `${customStart} 00:00:00 s/d ${customEnd} 23:59:59`;
    return `${fmt(start)} s/d ${fmt(end)}`;
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Bahan Baku</h1>

      {/* Tabs */}
      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Stok ── */}
      {activeTab === "stok" && (
        <div className="card">
          <div className="space-y-2">
            {bahanList.map((b) => <BahanCard key={b.id} bahan={b} onSubmit={submitTransaksi} />)}
          </div>
        </div>
      )}

      {/* ── Tab: Riwayat Penerimaan/Pengurangan ── */}
      {activeTab === "riwayat" && (
        <div className="space-y-3">
          <DateRangeFilter
            preset={preset} onPreset={handlePreset} now={now}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            rangeLabel={rangeLabel()}
          />
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-gray-500 shrink-0">Cari bahan:</label>
              <input className="input text-sm py-1.5 flex-1" placeholder="Nama bahan..."
                value={filterRiwayatBahan} onChange={(e) => setFilterRiwayatBahan(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Riwayat ({riwayatFiltered.length} data)
              </span>
            </div>
            <div className="space-y-2">
              {riwayatFiltered.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">Tidak ada data dalam rentang ini</p>
                : riwayatFiltered.map((r) => {
                    const masuk = r.tipe === "masuk";
                    return (
                      <div key={r.id} className="flex items-start justify-between border-b border-gray-50 pb-2.5">
                        <div>
                          <p className={`text-sm font-bold ${masuk ? "text-green-600" : "text-red-500"}`}>
                            {masuk ? "+" : "−"} {formatAngka(r.jumlah)} {r.satuan} — {r.bahan_baku?.nama}
                          </p>
                          <p className="text-xs text-gray-500">{formatTanggal(r.tanggal)} · oleh {r.users?.nama}</p>
                          <p className="text-xs text-gray-300">{formatTanggalWaktu(r.created_at)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-3 ${masuk ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {masuk ? "Masuk" : "Keluar"}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Riwayat Pemakaian ── */}
      {activeTab === "pemakaian" && (
        <div className="space-y-3">
          <DateRangeFilter
            preset={preset} onPreset={handlePreset} now={now}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            rangeLabel={rangeLabel()}
          />
          {/* Grand Total panel — gabungan Produksi + Proses Bikin */}
          {pemakaianFiltered.length > 0 && (() => {
            const totals: Record<string, { jumlah: number; satuan: string }> = {};
            for (const r of pemakaianFiltered) {
              if (!totals[r.namaBahan]) totals[r.namaBahan] = { jumlah: 0, satuan: r.satuan };
              totals[r.namaBahan].jumlah += r.jumlah;
            }
            const prodCount = pemakaianFiltered.filter(r => r.sumber === "produksi").length;
            const pbCount   = pemakaianFiltered.filter(r => r.sumber === "proses_bikin").length;
            const sorted = Object.entries(totals).sort((a, b) => {
              const ia = URUTAN_BAHAN.indexOf(a[0]), ib = URUTAN_BAHAN.indexOf(b[0]);
              return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            return (
              <div className="bg-gray-900 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">═ Grand Total Pemakaian</p>
                  <div className="flex gap-2">
                    {prodCount > 0 && <span className="text-[10px] bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded-full">Produksi ×{prodCount}</span>}
                    {pbCount   > 0 && <span className="text-[10px] bg-blue-900  text-blue-300  px-1.5 py-0.5 rounded-full">Proses Bikin ×{pbCount}</span>}
                  </div>
                </div>
                {sorted.map(([nama, { jumlah, satuan }]) => (
                  <div key={nama} className="flex items-center justify-between">
                    <span className="text-xs text-gray-300">{nama}</span>
                    <span className="text-xs font-bold text-white">{formatAngka(jumlah)} {satuan}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-gray-500 shrink-0">Cari bahan:</label>
              <input className="input text-sm py-1.5 flex-1" placeholder="Nama bahan..."
                value={filterPemakaianBahan} onChange={(e) => setFilterPemakaianBahan(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-gray-600">
                Riwayat Pemakaian ({pemakaianFiltered.length} data)
              </span>
            </div>
            <div className="space-y-2.5">
              {pemakaianFiltered.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">Tidak ada data dalam rentang ini</p>
                : pemakaianFiltered.map((r) => (
                    <div key={r.id} className="border-b border-gray-50 pb-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-red-500">
                          − {formatAngka(r.jumlah)} {r.satuan} — {r.namaBahan}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          r.sumber === "produksi"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {r.sumber === "produksi" ? "Produksi" : "Proses Bikin"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        dari <span className="font-medium">{r.label}</span>
                        {r.tanggal ? `, ${formatTanggal(r.tanggal)}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">oleh {r.namaUser} · {formatTanggalWaktu(r.created_at)}</p>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DateRangeFilter ───────────────────────────────────────────
const PRESET_OPTS: { key: DatePreset; label: string }[] = [
  { key: "today",     label: "Hari ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "7days",     label: "7 Hari" },
  { key: "30days",    label: "1 Bulan" },
  { key: "custom",    label: "Custom" },
];

function DateRangeFilter({
  preset, onPreset, now,
  customStart, customEnd, onCustomStart, onCustomEnd,
  rangeLabel,
}: {
  preset: DatePreset; onPreset: (p: DatePreset) => void; now: Date;
  customStart: string; customEnd: string;
  onCustomStart: (v: string) => void; onCustomEnd: (v: string) => void;
  rangeLabel: string;
}) {
  return (
    <div className="card space-y-3">
      {/* Preset chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Calendar size={14} className="text-gray-400 shrink-0" />
        {PRESET_OPTS.map((opt) => (
          <button key={opt.key} onClick={() => onPreset(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              preset === opt.key
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-amber-100 hover:text-amber-700"
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Active range info */}
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-medium ${preset === "today" || preset === "7days" || preset === "30days" ? "text-amber-600" : "text-gray-500"}`}>
          {preset === "today" || preset === "7days" || preset === "30days"
            ? "⏱ " + rangeLabel
            : rangeLabel}
        </span>
      </div>

      {/* Custom range — dua kalender berdampingan */}
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Tanggal Mulai</p>
            <MiniCalendar value={customStart} onChange={onCustomStart} maxDate={customEnd} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Tanggal Akhir</p>
            <MiniCalendar value={customEnd} onChange={onCustomEnd} minDate={customStart} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── MiniCalendar ─────────────────────────────────────────────
const HARI_MINI  = ["S","S","R","K","J","S","M"];
const NAMA_BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function MiniCalendar({ value, onChange, minDate, maxDate }: {
  value: string; onChange: (v: string) => void;
  minDate?: string; maxDate?: string;
}) {
  const initDate = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const selected = value ? new Date(value + "T00:00:00") : null;

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }

  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstOffset).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i+1)];

  function toDateStr(day: number) {
    return `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  function isSelected(day: number) {
    return selected !== null && selected.getDate() === day && selected.getMonth() === viewMonth && selected.getFullYear() === viewYear;
  }
  function isToday(day: number) { return toDateStr(day) === localDateStr(new Date()); }
  function isDisabled(day: number) {
    const s = toDateStr(day);
    return (!!minDate && s < minDate) || (!!maxDate && s > maxDate);
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-2.5 select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-bold text-gray-700">
          {NAMA_BULAN_ID[viewMonth].slice(0,3)} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {HARI_MINI.map((h, i) => (
          <p key={i} className="text-center text-[10px] font-semibold text-gray-400 py-0.5">{h}</p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) =>
          day === null ? <div key={`e-${i}`} /> : (
            <button key={day} type="button"
              disabled={isDisabled(day)}
              onClick={() => onChange(toDateStr(day))}
              className={`text-center text-[11px] py-1 rounded-md font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isSelected(day) ? "bg-amber-500 text-white" :
                isToday(day)    ? "bg-amber-100 text-amber-700" :
                "hover:bg-white text-gray-700"
              }`}>{day}</button>
          )
        )}
      </div>
    </div>
  );
}

// ── Stok awal referensi (nilai reset terakhir migration 020) ──
const STOK_AWAL: Record<string, number> = {
  "Terigu":              500,
  "Minyak":              500,
  "Garam":                25,
  "Gula":                 50,
  "Air":                 190,
  "Margarine Menara":    100,
  "Mesis Innova":        100,
  "Keju Calf":            32,
  "Margarine Blue Band":  50,
  "Mesis Tulip":          50,
  "Keju Kraft Martabak":  16,
  "Baking Powder":         1,
  "Telur":               225,
  "Tepung Gandum":         5,
  "Butter Hollmann":       1,
};

// ── BahanCard ────────────────────────────────────────────────
function BahanCard({ bahan, onSubmit }: {
  bahan: BahanBaku;
  onSubmit: (id: string, tipe: "masuk" | "keluar", jumlah: number, satuan: string) => Promise<boolean>;
}) {
  const kritis = bahan.stok_saat_ini <= bahan.stok_minimum;
  const [mode,    setMode]    = useState<"masuk" | "keluar" | null>(null);
  const [jumlah,  setJumlah]  = useState("");
  const [satuan,  setSatuan]  = useState("");
  const [loading, setLoading] = useState(false);

  function openForm(tipe: "masuk" | "keluar") { setMode(tipe); setJumlah(""); setSatuan(""); }
  function closeForm() { setMode(null); setJumlah(""); setSatuan(""); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jumlah || !satuan || !mode) return;
    setLoading(true);
    const ok = await onSubmit(bahan.id, mode, parseFloat(jumlah), satuan);
    setLoading(false);
    if (ok) closeForm();
  }

  const stokAwal    = STOK_AWAL[bahan.nama] ?? null;
  const pengurangan = stokAwal !== null ? stokAwal - bahan.stok_saat_ini : 0;
  const adaPengurangan = stokAwal !== null && pengurangan > 0.0005; // threshold supaya 0.000 tidak tampil

  return (
    <div className={`rounded-xl border p-3 transition-all ${kritis ? "bg-red-50 border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-semibold text-sm ${kritis ? "text-red-700" : "text-gray-800"}`}>{bahan.nama}</p>
          <p className="text-xs text-gray-400">Min: {formatAngka(bahan.stok_minimum)} {bahan.satuan}</p>
          {kritis && <p className="text-xs text-red-500 font-medium mt-0.5">⚠ Stok kritis!</p>}
        </div>
        <div className="text-right ml-3 shrink-0">
          {/* Stok real */}
          <p className={`font-bold text-xl leading-none ${kritis ? "text-red-600" : "text-gray-800"}`}>
            {formatAngka(bahan.stok_saat_ini)}
            <span className="text-sm font-normal text-gray-400 ml-1">{bahan.satuan}</span>
          </p>
          {/* Pengurangan — hanya tampil jika ada pemakaian */}
          {adaPengurangan && (
            <p className="text-xs mt-0.5 flex items-center justify-end gap-0.5">
              <span style={{ color: "#EF4444" }} className="font-bold text-sm">↓</span>
              <span style={{ color: "#EF4444" }} className="font-semibold">
                {formatAngka(pengurangan)} {bahan.satuan}
              </span>
            </p>
          )}
        </div>
      </div>

      {!mode && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => openForm("masuk")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
            <Plus size={12} /> Tambah
          </button>
          <button onClick={() => openForm("keluar")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
            <Minus size={12} /> Kurangi
          </button>
        </div>
      )}

      {mode && (
        <form onSubmit={handleSubmit} className="mt-2.5">
          <div className={`text-xs font-semibold mb-1.5 ${mode === "masuk" ? "text-green-700" : "text-red-600"}`}>
            {mode === "masuk" ? "+ Tambah stok" : "− Kurangi stok"}
          </div>
          <div className="flex gap-2 items-center">
            <input type="number" step="0.01" min="0.01" required autoFocus value={jumlah}
              onChange={(e) => setJumlah(e.target.value)} placeholder="Jumlah"
              className="input py-1.5 text-sm w-24 text-center" />
            <select required value={satuan} onChange={(e) => setSatuan(e.target.value)} className="input py-1.5 text-sm flex-1">
              <option value="">Satuan</option>
              {SATUAN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="submit" disabled={loading || !jumlah || !satuan}
              className={`flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0 transition-colors disabled:opacity-40 ${mode === "masuk" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}>
              {loading ? <span className="text-xs">…</span> : <Check size={14} />}
            </button>
            <button type="button" onClick={closeForm}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0 transition-colors">
              <X size={14} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
