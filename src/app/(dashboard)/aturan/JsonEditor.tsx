"use client";
// Editor generik untuk nilai JSONB aturan: merender tiap leaf
// (number/string/boolean) jadi input, dengan path sebagai label.
// Dipakai supaya SEMUA angka aturan bisa diubah dari admin panel
// tanpa perlu bikin form khusus per bentuk config.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function isObj(v: Json): v is { [k: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isLeaf(v: Json): boolean {
  return !isObj(v) && !Array.isArray(v);
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
      <label className="flex items-center justify-between gap-3 py-2 text-sm border-b border-gray-100 last:border-0">
        <span className="text-gray-600">{label}</span>
        <input type="checkbox" checked={value} className="w-4 h-4 accent-amber-500"
          onChange={(e) => onChange(path, e.target.checked)} />
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <div className="flex items-center justify-between gap-3 py-2 text-sm border-b border-gray-100 last:border-0">
        <span className="text-gray-600">{label}</span>
        <div className="flex flex-col items-end shrink-0">
          <input type="number" step="any" value={value} className="input py-1 text-sm w-28 text-right"
            onChange={(e) => onChange(path, e.target.value === "" ? 0 : parseFloat(e.target.value))} />
          {isUang && <span className="text-[10px] text-gray-400 mt-0.5">{formatRupiah(value)}</span>}
        </div>
      </div>
    );
  }
  if (typeof value === "string") {
    return (
      <label className="flex items-center justify-between gap-3 py-2 text-sm border-b border-gray-100 last:border-0">
        <span className="text-gray-600">{label}</span>
        <input type="text" value={value} className="input py-1 text-sm w-44"
          onChange={(e) => onChange(path, e.target.value)} />
      </label>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-300 text-xs">null</span>
    </div>
  );
}

// Grup bernama (mis. "Alpha", "Tepat Waktu") dirender sebagai kotak sendiri
// dengan judul jelas, supaya tiap kategori gampang dipindai matanya —
// sebelumnya semua field numpuk jadi satu daftar panjang tanpa pemisah.
function GroupBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2 mb-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">{title}</p>
      <div>{children}</div>
    </div>
  );
}

function ArrayNode({ path, value, onChange }: {
  path: (string | number)[]; value: Json[];
  onChange: (path: (string | number)[], v: Json) => void;
}) {
  return (
    <>
      {value.map((item, i) => (
        <div key={i} className="rounded-lg bg-white px-2.5 py-1 my-1 border border-gray-100">
          {isObj(item) || Array.isArray(item)
            ? <Node path={[...path, i]} value={item} onChange={onChange} />
            : <Leaf path={[...path, i]} value={item} onChange={onChange} />}
        </div>
      ))}
    </>
  );
}

function Node({ path, value, onChange }: {
  path: (string | number)[]; value: Json;
  onChange: (path: (string | number)[], v: Json) => void;
}) {
  if (Array.isArray(value)) return <ArrayNode path={path} value={value} onChange={onChange} />;
  if (!isObj(value)) return <Leaf path={path} value={value} onChange={onChange} />;

  const entries = Object.entries(value);
  const leafEntries = entries.filter(([, v]) => isLeaf(v));
  const groupEntries = entries.filter(([, v]) => !isLeaf(v));

  return (
    <div>
      {leafEntries.length > 0 && (
        <div className="mb-2.5">
          {leafEntries.map(([k, v]) => (
            <Leaf key={k} path={[...path, k]} value={v} onChange={onChange} />
          ))}
        </div>
      )}
      {groupEntries.map(([k, v]) => (
        <GroupBox key={k} title={labelDari(k)}>
          <Node path={[...path, k]} value={v} onChange={onChange} />
        </GroupBox>
      ))}
    </div>
  );
}

export default function JsonEditor({ value, onChange }: {
  value: Json; onChange: (next: Json) => void;
}) {
  return <Node path={[]} value={value} onChange={(path, v) => onChange(setIn(value, path, v))} />;
}
