"use client";
// Editor generik untuk nilai JSONB aturan: merender tiap leaf
// (number/string/boolean) jadi input, dengan path sebagai label.
// Dipakai supaya SEMUA angka aturan bisa diubah dari admin panel
// tanpa perlu bikin form khusus per bentuk config.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function isObj(v: Json): v is { [k: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function labelDari(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function setIn(root: Json, path: (string | number)[], val: Json): Json {
  if (path.length === 0) return val;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[head as number] = setIn(copy[head as number] ?? null, rest, val);
    return copy;
  }
  const copy: { [k: string]: Json } = isObj(root) ? { ...root } : {};
  copy[head as string] = setIn(copy[head as string] ?? null, rest, val);
  return copy;
}

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

function Leaf({ path, value, onChange }: {
  path: (string | number)[]; value: Json; onChange: (path: (string | number)[], v: Json) => void;
}) {
  const key = String(path[path.length - 1]);
  const label = labelDari(key);
  const isUang = typeof value === "number" && (
    key.includes("denda") || key.includes("nominal") || key.includes("honor") ||
    key.includes("upah") || key.includes("maks_nominal") || key.includes("per_bulan") ||
    key.includes("persetujuan_tertulis_diatas")
  );

  if (typeof value === "boolean") {
    return (
      <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-gray-600">{label}</span>
        <input type="checkbox" checked={value} className="w-4 h-4 accent-amber-500"
          onChange={(e) => onChange(path, e.target.checked)} />
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {isUang && <span className="text-[10px] text-gray-400">{formatRupiah(value)}</span>}
          <input type="number" step="any" value={value} className="input py-1 text-sm w-32 text-right"
            onChange={(e) => onChange(path, e.target.value === "" ? 0 : parseFloat(e.target.value))} />
        </span>
      </label>
    );
  }
  if (typeof value === "string") {
    return (
      <label className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-gray-600">{label}</span>
        <input type="text" value={value} className="input py-1 text-sm w-44"
          onChange={(e) => onChange(path, e.target.value)} />
      </label>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-300 text-xs">null</span>
    </div>
  );
}

function Node({ path, value, onChange, depth = 0 }: {
  path: (string | number)[]; value: Json;
  onChange: (path: (string | number)[], v: Json) => void; depth?: number;
}) {
  if (Array.isArray(value)) {
    return (
      <div className={depth > 0 ? "pl-3 border-l border-gray-100" : ""}>
        {path.length > 0 && (
          <p className="text-xs font-semibold text-gray-500 mt-2 mb-0.5">{labelDari(String(path[path.length - 1]))}</p>
        )}
        {value.map((item, i) => (
          <div key={i} className="rounded-lg bg-gray-50/70 px-2.5 py-1 my-1">
            <Node path={[...path, i]} value={item} onChange={onChange} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (isObj(value)) {
    return (
      <div className={depth > 0 ? "pl-3 border-l border-gray-100" : ""}>
        {path.length > 0 && typeof path[path.length - 1] === "string" && (
          <p className="text-xs font-semibold text-gray-500 mt-2 mb-0.5">{labelDari(String(path[path.length - 1]))}</p>
        )}
        {Object.entries(value).map(([k, v]) => (
          <Node key={k} path={[...path, k]} value={v} onChange={onChange} depth={depth + 1} />
        ))}
      </div>
    );
  }
  return <Leaf path={path} value={value} onChange={onChange} />;
}

export default function JsonEditor({ value, onChange }: {
  value: Json; onChange: (next: Json) => void;
}) {
  return (
    <Node path={[]} value={value} depth={0}
      onChange={(path, v) => onChange(setIn(value, path, v))} />
  );
}
