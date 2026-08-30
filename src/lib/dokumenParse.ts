// ============================================================
// Pasca-proses HTML hasil konversi docx (mammoth):
// mengubah field titik-titik "............" jadi penanda
// <span data-field="..."> yang nanti diisi input oleh React.
//
// Field dikenali dari LABEL pada sel pertama baris tabel yang
// sama, sehingga tetap benar walau urutan pasal berubah.
// ============================================================

export type PemilikField = "karyawan" | "perusahaan";

export interface DefinisiField {
  key: string;
  label: string;
  pemilik: PemilikField;
  tipe: "text" | "date" | "tel";
  wajib: boolean;
}

// Label di dokumen → field. Pencocokan case-insensitive & abaikan spasi ganda.
export const FIELD_BY_LABEL: Record<string, DefinisiField> = {
  "nama lengkap":          { key: "nama_lengkap",       label: "Nama Lengkap",         pemilik: "karyawan",   tipe: "text", wajib: true },
  "nik / no. ktp":         { key: "nik",                label: "NIK / No. KTP",        pemilik: "karyawan",   tipe: "text", wajib: true },
  "tempat, tanggal lahir": { key: "ttl",                label: "Tempat, Tanggal Lahir", pemilik: "karyawan",  tipe: "text", wajib: true },
  "alamat":                { key: "alamat",             label: "Alamat",               pemilik: "karyawan",   tipe: "text", wajib: true },
  "no. telepon":           { key: "no_telepon",         label: "No. Telepon",          pemilik: "karyawan",   tipe: "tel",  wajib: true },
  "nama karyawan":         { key: "nama_lengkap",       label: "Nama Karyawan",        pemilik: "karyawan",   tipe: "text", wajib: true },
  "tanggal mulai kerja":   { key: "tanggal_mulai_kerja",label: "Tanggal Mulai Kerja",  pemilik: "karyawan",   tipe: "date", wajib: true },
  "tanggal":               { key: "tanggal_ttd",        label: "Tanggal Tanda Tangan", pemilik: "karyawan",   tipe: "date", wajib: true },
  "diwakili oleh":         { key: "diwakili_oleh",      label: "Diwakili oleh",        pemilik: "perusahaan", tipe: "text", wajib: true },
  "jabatan":               { key: "jabatan_perwakilan", label: "Jabatan Perwakilan",   pemilik: "perusahaan", tipe: "text", wajib: true },
};

export const FIELD_TANGGAL_DOKUMEN: DefinisiField = {
  key: "tanggal_ttd", label: "Tanggal Tanda Tangan", pemilik: "karyawan", tipe: "date", wajib: true,
};

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function isTitikTitik(s: string): boolean {
  return /^[.…\s]*\.{5,}[.…\s]*$/.test(s.trim());
}

export interface HasilParse {
  html: string;
  fields: DefinisiField[];   // field unik yang ditemukan di dokumen ini
  tidakDikenali: string[];   // label bertitik yang tidak ada di peta — dilaporkan, tidak dibuang
}

/**
 * Ubah HTML dokumen jadi HTML dengan penanda field.
 * Dijalankan di browser (butuh DOMParser).
 */
export function siapkanDokumen(htmlAsli: string): HasilParse {
  const doc = new DOMParser().parseFromString(`<div id="root">${htmlAsli}</div>`, "text/html");
  const root = doc.getElementById("root")!;
  const ditemukan = new Map<string, DefinisiField>();
  const tidakDikenali: string[] = [];

  // 1) Field dalam baris tabel: label ada di sel pertama baris yang sama.
  root.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.children) as HTMLElement[];
    if (cells.length < 2) return;
    const label = norm(cells[0].textContent ?? "");
    for (let i = 1; i < cells.length; i++) {
      const teks = cells[i].textContent ?? "";
      if (!isTitikTitik(teks)) continue;
      const def = FIELD_BY_LABEL[label];
      if (!def) { if (label) tidakDikenali.push(cells[0].textContent?.trim() ?? ""); continue; }
      cells[i].innerHTML = `<span data-field="${def.key}" data-pemilik="${def.pemilik}" data-tipe="${def.tipe}"></span>`;
      ditemukan.set(def.key, def);
    }
  });

  // 2) Nama di bawah tanda tangan: "(............)" — kiri perusahaan, kanan karyawan.
  //    Diisi otomatis dari field nama, jadi ditandai read-only.
  root.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.children) as HTMLElement[];
    const semuaKurung = cells.length >= 2 && cells.every((c) => /^\(\s*\.{5,}\s*\)$/.test((c.textContent ?? "").trim()));
    if (!semuaKurung) return;
    cells.forEach((c, i) => {
      const key = i === 0 ? "diwakili_oleh" : "nama_lengkap";
      c.innerHTML = `(<span data-field="${key}" data-pemilik="${i === 0 ? "perusahaan" : "karyawan"}" data-tipe="text" data-readonly="1"></span>)`;
    });
  });

  // 3) Paragraf "dibuat dan ditandatangani pada tanggal ... bulan ... tahun ..."
  //    → satu input tanggal, bukan tiga kolom terpisah.
  root.querySelectorAll("p").forEach((p) => {
    const t = p.textContent ?? "";
    if (!/pada tanggal/i.test(t) || !/\.{5,}/.test(t)) return;
    p.innerHTML = p.innerHTML.replace(
      /pada tanggal[\s\S]*?tahun\s*\.{5,}/i,
      `pada tanggal <span data-field="tanggal_ttd" data-pemilik="karyawan" data-tipe="date"></span>`
    );
    ditemukan.set(FIELD_TANGGAL_DOKUMEN.key, FIELD_TANGGAL_DOKUMEN);
  });

  // 4) Sisa titik-titik yang belum tertangani → biarkan terlihat sebagai garis kosong,
  //    supaya tidak ada isi dokumen yang hilang diam-diam.
  root.querySelectorAll("td, th, p").forEach((el) => {
    if (el.querySelector("[data-field]")) return;
    const t = el.textContent ?? "";
    if (el.children.length === 0 && isTitikTitik(t)) {
      el.innerHTML = `<span class="dok-kosong">${t.trim()}</span>`;
    }
  });

  return {
    html: root.innerHTML,
    fields: Array.from(ditemukan.values()),
    tidakDikenali: Array.from(new Set(tidakDikenali)),
  };
}

// Field yang boleh diisi oleh pihak tertentu pada dokumen ini.
export function fieldMilik(fields: DefinisiField[], pemilik: PemilikField): DefinisiField[] {
  return fields.filter((f) => f.pemilik === pemilik);
}
