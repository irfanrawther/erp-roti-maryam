"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { siapkanDokumen, type DefinisiField, type PemilikField } from "@/lib/dokumenParse";

export interface NilaiField { [key: string]: string }

/**
 * Merender isi dokumen (HTML hasil konversi docx) dengan field
 * titik-titik diganti input yang dikontrol React lewat portal —
 * struktur tabel/pasal aslinya tetap utuh.
 *
 * `pemilik` menentukan field mana yang bisa diedit; field milik
 * pihak lain tampil read-only.
 */
export default function DokumenTerstruktur({
  html, nilai, pemilik, onChange, readOnly = false, onFields,
}: {
  html: string;
  nilai: NilaiField;
  pemilik: PemilikField;
  onChange?: (key: string, value: string) => void;
  readOnly?: boolean;
  onFields?: (fields: DefinisiField[], tidakDikenali: string[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState<{ el: HTMLElement; key: string; pemilik: PemilikField; tipe: string; ro: boolean }[]>([]);

  const parsed = useMemo(() => {
    if (typeof window === "undefined") return { html, fields: [], tidakDikenali: [] };
    try { return siapkanDokumen(html); }
    catch { return { html, fields: [], tidakDikenali: [] }; }
  }, [html]);

  useEffect(() => {
    onFields?.(parsed.fields, parsed.tidakDikenali);
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Setelah HTML masuk DOM, kumpulkan penanda field untuk di-portal.
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>("[data-field]")).map((el) => ({
      el,
      key: el.dataset.field!,
      pemilik: (el.dataset.pemilik as PemilikField) ?? "karyawan",
      tipe: el.dataset.tipe ?? "text",
      ro: el.dataset.readonly === "1",
    }));
    setSlots(found);
  }, [parsed.html]);

  return (
    <div className="dok-body">
      <div ref={wrapRef} dangerouslySetInnerHTML={{ __html: parsed.html }} />
      {slots.map((s, i) => {
        const val = nilai[s.key] ?? "";
        const bisaEdit = !readOnly && !s.ro && s.pemilik === pemilik;
        if (!bisaEdit) {
          return createPortal(
            <span className={val ? "font-semibold text-gray-900" : "text-gray-300"}>
              {val || "……………………"}
            </span>,
            s.el, `f${i}`
          );
        }
        return createPortal(
          <input
            type={s.tipe === "date" ? "date" : s.tipe === "tel" ? "tel" : "text"}
            value={val}
            onChange={(e) => onChange?.(s.key, e.target.value)}
            placeholder="Isi di sini"
            className="w-full min-w-[120px] border-b border-indigo-400 focus:border-indigo-600 outline-none px-1 py-0.5 text-indigo-700 font-semibold bg-indigo-50/60 rounded-sm"
          />,
          s.el, `f${i}`
        );
      })}

      <style jsx global>{`
        .dok-body { font-size: 13px; line-height: 1.65; color: #374151; }
        .dok-body h1 { font-size: 14px; font-weight: 700; color: #b91c1c; text-align: center; margin: 18px 0 8px; }
        .dok-body h2 { font-size: 13px; font-weight: 700; color: #1f2937; margin: 14px 0 4px; }
        .dok-body p { margin: 6px 0; }
        .dok-body strong { color: #111827; }
        .dok-body table {
          width: 100%; border-collapse: collapse; margin: 8px 0;
          display: block; overflow-x: auto; white-space: normal;
        }
        .dok-body td, .dok-body th {
          border: 1px solid #e5e7eb; padding: 5px 7px;
          text-align: left; font-weight: 400; vertical-align: top;
          font-size: 12px;
        }
        .dok-body th p, .dok-body td p { margin: 0; }
        .dok-body tr:first-child th strong { font-weight: 700; }
        .dok-kosong { color: #d1d5db; letter-spacing: 1px; }
      `}</style>
    </div>
  );
}
