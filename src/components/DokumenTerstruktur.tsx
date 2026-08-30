"use client";
import { useEffect, useMemo, type ReactNode } from "react";
import { siapkanDokumen, type DefinisiField, type PemilikField } from "@/lib/dokumenParse";

export interface NilaiField { [key: string]: string }

// Tag yang diizinkan dari hasil konversi docx.
const TAG_AMAN = new Set([
  "p", "h1", "h2", "h3", "h4", "strong", "em", "b", "i", "u", "br", "span",
  "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "a", "sup", "sub",
]);

function attrReact(el: Element): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const colspan = el.getAttribute("colspan");
  const rowspan = el.getAttribute("rowspan");
  if (colspan) out.colSpan = Number(colspan) || undefined;
  if (rowspan) out.rowSpan = Number(rowspan) || undefined;
  if (el.tagName.toLowerCase() === "a") {
    out.href = el.getAttribute("href") ?? undefined;
    out.target = "_blank";
    out.rel = "noopener noreferrer";
  }
  const cls = el.getAttribute("class");
  if (cls) out.className = cls;
  return out;
}

/**
 * Merender isi dokumen (HTML hasil konversi docx) sebagai elemen React.
 * Field titik-titik jadi input yang dikontrol React, sementara struktur
 * pasal/tabel aslinya tetap utuh.
 *
 * Konversi DOM → React (bukan innerHTML + portal) supaya nilainya selalu
 * ikut ter-render ulang saat state berubah.
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
  const parsed = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { return siapkanDokumen(html); } catch { return null; }
  }, [html]);

  useEffect(() => {
    if (parsed) onFields?.(parsed.fields, parsed.tidakDikenali);
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = useMemo(() => {
    if (typeof window === "undefined" || !parsed) return null;
    return new DOMParser().parseFromString(`<div id="r">${parsed.html}</div>`, "text/html").getElementById("r");
  }, [parsed]);

  function render(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Field isian
    const field = el.getAttribute("data-field");
    if (field) {
      const pemilikField = (el.getAttribute("data-pemilik") as PemilikField) ?? "karyawan";
      const tipe = el.getAttribute("data-tipe") ?? "text";
      const ro = el.getAttribute("data-readonly") === "1";
      const val = nilai[field] ?? "";
      const bisaEdit = !readOnly && !ro && pemilikField === pemilik;

      if (!bisaEdit) {
        return (
          <span key={key} className={val ? "font-semibold text-gray-900" : "text-gray-300"}>
            {val || "……………………"}
          </span>
        );
      }
      return (
        <input
          key={key}
          type={tipe === "date" ? "date" : tipe === "tel" ? "tel" : "text"}
          value={val}
          onChange={(e) => onChange?.(field, e.target.value)}
          placeholder="Isi di sini"
          className="dok-input"
        />
      );
    }

    if (!TAG_AMAN.has(tag)) {
      return <span key={key}>{Array.from(el.childNodes).map((c, i) => render(c, `${key}.${i}`))}</span>;
    }
    if (tag === "br") return <br key={key} />;

    const children = Array.from(el.childNodes).map((c, i) => render(c, `${key}.${i}`));
    const Tag = tag as keyof JSX.IntrinsicElements;
    return <Tag key={key} {...attrReact(el)}>{children.length ? children : undefined}</Tag>;
  }

  return (
    <div className="dok-body">
      {body ? Array.from(body.childNodes).map((n, i) => render(n, `n${i}`)) : null}

      <style jsx global>{`
        .dok-body { font-size: 13px; line-height: 1.7; color: #374151; }
        .dok-body h1 { font-size: 13.5px; font-weight: 700; color: #b91c1c; text-align: center; margin: 20px 0 8px; letter-spacing: .01em; }
        .dok-body h2 { font-size: 13px; font-weight: 700; color: #111827; margin: 16px 0 4px; }
        .dok-body h3, .dok-body h4 { font-size: 12.5px; font-weight: 700; color: #1f2937; margin: 12px 0 4px; }
        .dok-body p { margin: 7px 0; }
        .dok-body strong { color: #111827; font-weight: 700; }
        .dok-body table {
          width: 100%; border-collapse: collapse; margin: 10px 0;
          display: block; overflow-x: auto;
        }
        .dok-body td, .dok-body th {
          border: 1px solid #e5e7eb; padding: 6px 8px;
          text-align: left; font-weight: 400; vertical-align: middle;
          font-size: 12px; min-width: 64px;
        }
        .dok-body th p, .dok-body td p { margin: 0; }
        .dok-body tr:first-child th { background: #f9fafb; }
        .dok-body tr:first-child th strong { font-weight: 700; }
        .dok-kosong { color: #d1d5db; letter-spacing: 1px; }
        .dok-input {
          width: 100%; min-width: 110px; box-sizing: border-box;
          border: 0; border-bottom: 1.5px solid #818cf8; outline: none;
          padding: 3px 5px; font-size: 12.5px; font-weight: 600;
          color: #4338ca; background: #eef2ff; border-radius: 4px 4px 0 0;
        }
        .dok-input:focus { border-bottom-color: #4f46e5; background: #e0e7ff; }
        .dok-input::placeholder { color: #a5b4fc; font-weight: 400; }
      `}</style>
    </div>
  );
}
