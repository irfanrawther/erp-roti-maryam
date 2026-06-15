"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type RiwayatPreset = "hari_ini" | "kemarin" | "7hari" | "1bulan" | "custom" | "bulan";

const ID_DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export const ID_MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export function getRiwayatRange(
  preset: RiwayatPreset,
  customStart: string,
  customEnd: string,
  selectedBulan: string,
): { start: string; end: string } {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  switch (preset) {
    case "hari_ini": return { start: todayStr, end: todayStr };
    case "kemarin": {
      const d = new Date(todayStr); d.setDate(d.getDate() - 1);
      const s = d.toLocaleDateString("en-CA"); return { start: s, end: s };
    }
    case "7hari": {
      const d = new Date(todayStr); d.setDate(d.getDate() - 6);
      return { start: d.toLocaleDateString("en-CA"), end: todayStr };
    }
    case "1bulan": {
      const d = new Date(todayStr); d.setDate(d.getDate() - 29);
      return { start: d.toLocaleDateString("en-CA"), end: todayStr };
    }
    case "custom":
      return { start: customStart || todayStr, end: customEnd || todayStr };
    case "bulan": {
      const [y, m] = selectedBulan.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return { start: `${selectedBulan}-01`, end: `${selectedBulan}-${String(lastDay).padStart(2, "0")}` };
    }
  }
}

function RangeCalendar({ start, end, onSelect, accentColor = "amber" }: {
  start: string; end: string;
  onSelect: (d: string) => void;
  accentColor?: "amber" | "red" | "green";
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const [viewYear, setViewYear] = useState(() => parseInt((start || today).slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt((start || today).slice(5, 7)) - 1);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const accentBg = accentColor === "red" ? "bg-red-600" : accentColor === "green" ? "bg-green-600" : "bg-amber-500";
  const accentRangeBg = accentColor === "red" ? "bg-red-50 text-red-600" : accentColor === "green" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-500";

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-gray-700">{ID_MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {ID_DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isStart = dateStr === start;
          const isEnd = dateStr === end;
          const inRange = start && end && dateStr > start && dateStr < end;
          const isToday = dateStr === today;
          return (
            <button key={i} onClick={() => onSelect(dateStr)}
              className={[
                "w-full py-1 text-xs rounded-lg transition-colors font-medium",
                isStart || isEnd ? `${accentBg} text-white` :
                inRange ? accentRangeBg :
                isToday ? "ring-1 ring-gray-300 text-gray-700 hover:bg-gray-100" :
                "text-gray-700 hover:bg-gray-100",
              ].join(" ")}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RiwayatFilter({ preset, onPreset, customStart, customEnd, onCustomStart, onCustomEnd, selectedBulan, onBulan, accentColor = "amber" }: {
  preset: RiwayatPreset; onPreset: (p: RiwayatPreset) => void;
  customStart: string; customEnd: string;
  onCustomStart: (v: string) => void; onCustomEnd: (v: string) => void;
  selectedBulan: string; onBulan: (v: string) => void;
  accentColor?: "amber" | "red" | "green";
}) {
  const [rangeStep, setRangeStep] = useState<"start" | "end">("start");
  const accentActive = accentColor === "red" ? "bg-red-600 text-white" : accentColor === "green" ? "bg-green-600 text-white" : "bg-amber-500 text-white";
  const inactive = "bg-gray-100 text-gray-600 hover:bg-gray-200";

  const presets: [RiwayatPreset, string][] = [
    ["hari_ini", "Hari ini"],
    ["kemarin", "Kemarin"],
    ["7hari", "7 Hari"],
    ["1bulan", "1 Bulan"],
    ["bulan", "Pilih Bulan"],
    ["custom", "Custom"],
  ];

  const handleCalendarSelect = (d: string) => {
    if (rangeStep === "start") {
      onCustomStart(d); onCustomEnd(""); setRangeStep("end");
    } else {
      if (d < customStart) { onCustomEnd(customStart); onCustomStart(d); }
      else onCustomEnd(d);
      setRangeStep("start");
    }
  };

  const [bulanYear, bulanMonth] = selectedBulan.split("-").map(Number);
  const prevBulan = () => { if (bulanMonth === 1) onBulan(`${bulanYear - 1}-12`); else onBulan(`${bulanYear}-${String(bulanMonth - 1).padStart(2, "0")}`); };
  const nextBulan = () => { if (bulanMonth === 12) onBulan(`${bulanYear + 1}-01`); else onBulan(`${bulanYear}-${String(bulanMonth + 1).padStart(2, "0")}`); };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([k, lbl]) => (
          <button key={k} onClick={() => { onPreset(k); if (k === "custom") setRangeStep("start"); }}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${preset === k ? accentActive : inactive}`}>
            {lbl}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`px-2 py-1 rounded-lg font-medium ${rangeStep === "start" ? "bg-gray-200 text-gray-800" : "text-gray-400"}`}>
              {customStart || "Pilih tanggal awal"}
            </span>
            <span>→</span>
            <span className={`px-2 py-1 rounded-lg font-medium ${rangeStep === "end" ? "bg-gray-200 text-gray-800" : "text-gray-400"}`}>
              {customEnd || "Pilih tanggal akhir"}
            </span>
            {(customStart || customEnd) && (
              <button onClick={() => { onCustomStart(""); onCustomEnd(""); setRangeStep("start"); }} className="ml-auto text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
          </div>
          <p className="text-xs text-gray-400">{rangeStep === "start" ? "Klik tanggal awal" : "Klik tanggal akhir"}</p>
          <RangeCalendar start={customStart} end={customEnd} onSelect={handleCalendarSelect} accentColor={accentColor} />
        </div>
      )}

      {preset === "bulan" && (
        <div className="flex items-center gap-2">
          <button onClick={prevBulan} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
          <span className="flex-1 text-center text-sm font-semibold text-gray-700">{ID_MONTHS[bulanMonth - 1]} {bulanYear}</span>
          <button onClick={nextBulan} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
