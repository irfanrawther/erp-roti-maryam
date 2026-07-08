"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]; // mulai Senin

// Kalender Indonesia (hari pertama Senin). value = "YYYY-MM-DD".
export default function IndonesianDatePicker({ value, onChange, accent = "amber" }: {
  value: string; onChange: (v: string) => void; accent?: "amber" | "indigo";
}) {
  const todayDate = new Date();
  const initDate = value ? new Date(value + "T00:00:00") : todayDate;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const selected = value ? new Date(value + "T00:00:00") : null;

  const selBg = accent === "indigo" ? "bg-indigo-500" : "bg-amber-500";
  const todayBg = accent === "indigo" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700";

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); }

  const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function selectDay(day: number) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
  }
  const isSelected = (day: number) => selected !== null && selected.getDate() === day && selected.getMonth() === viewMonth && selected.getFullYear() === viewYear;
  const isToday = (day: number) => todayDate.getDate() === day && todayDate.getMonth() === viewMonth && todayDate.getFullYear() === viewYear;
  const isMinggu = (i: number) => i % 7 === 6;

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"><ChevronLeft size={18} /></button>
        <span className="font-bold text-gray-700 text-sm">{NAMA_BULAN[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {HARI_PENDEK.map((h, i) => <p key={h} className={`text-center text-[11px] font-semibold py-1 ${i === 6 ? "text-red-400" : "text-gray-400"}`}>{h}</p>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) =>
          day === null ? <div key={`e-${i}`} /> : (
            <button key={day} type="button" onClick={() => selectDay(day)}
              className={`text-center text-sm py-1.5 rounded-lg font-medium transition-colors ${
                isSelected(day) ? `${selBg} text-white shadow-sm` :
                isToday(day) ? todayBg :
                isMinggu(i) ? "text-red-500 hover:bg-white hover:shadow-sm" : "hover:bg-white hover:shadow-sm text-gray-700"
              }`}>{day}</button>
          )
        )}
      </div>
    </div>
  );
}
