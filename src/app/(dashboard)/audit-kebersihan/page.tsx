"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { kompresGambar } from "@/lib/gambar";
import { hitungResponDeadline } from "@/lib/pelanggaranAlur";
import { ClipboardCheck, Camera, X, CheckCircle2, AlertTriangle, Users, User } from "lucide-react";

type Sesi = "pagi" | "malam";
interface Karyawan { id: string; nama: string; kategori_dokumen: string | null }
interface ShiftMaster { id: string; nama_shift: string }
interface MasterKebersihan { id: string; jalur: string; poin: number }

interface ItemAudit {
  key: string;
  jenis_audit: "harian_pulang" | "piket" | "deep_clean_area" | "deep_clean_alat";
  area_label: string | null;
  nama_tugas: string;
  roster_id: string | null;
  template_id: string | null;
  shift_id: string | null;           // shift/area penanggung jawab (utk resolve pool kalau shift_tidak_pasti)
  karyawanDefault: string | null;    // dari roster (harian_pulang)
  // state hasil isian:
  status: "lulus" | "gagal";
  penanggungTipe: "individu" | "shift_tidak_pasti";
  penanggungKaryawanId: string;
  catatan: string;
  fotoFiles: File[];
}

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
function addDaysStr(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00+07:00`); d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
function wibHM(): { h: number; m: number } {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
  let [h, m] = s.split(":").map(Number);
  if (h === 24) h = 0;
  return { h, m };
}
function dayOfWeek(iso: string): number { return new Date(`${iso}T00:00:00+07:00`).getDay(); } // 0=Minggu..6=Sabtu
function labelTgl(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function jalurDariKategori(k: string | null): "training" | "staff" | "spv" | null {
  if (!k) return null;
  if (k.startsWith("training")) return "training";
  if (k.startsWith("staff")) return "staff";
  if (k === "spv") return "spv";
  return null;
}
const JENIS_LABEL: Record<string, string> = {
  harian_pulang: "Job Desc Pulang (Harian)", piket: "Piket Toilet & Kulkas",
  deep_clean_area: "Deep Clean Area Produksi", deep_clean_alat: "Deep Clean Alat Produksi",
};

export default function AuditKebersihanPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [step, setStep] = useState<"loading" | "notallowed" | "closed" | "form" | "done">("loading");
  const [pesanTutup, setPesanTutup] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [sesiUser, setSesiUser] = useState<Sesi | null>(null);
  const [tanggalTugas, setTanggalTugas] = useState("");
  const [sesiId, setSesiId] = useState<string | null>(null);
  const [auditorId, setAuditorId] = useState<string | null>(null);

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [shiftByNama, setShiftByNama] = useState<Record<string, ShiftMaster>>({});
  const [kebersihanRows, setKebersihanRows] = useState<MasterKebersihan[]>([]);
  const [items, setItems] = useState<ItemAudit[]>([]);
  const [ringkasan, setRingkasan] = useState({ lulus: 0, gagal: 0 });

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
    init(u);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function init(u: UserSession) {
    const [spvRes, kRes, sRes] = await Promise.all([
      supabase.from("audit_kebersihan_spv").select("sesi, karyawan_id, karyawan:karyawan_id(nama)"),
      supabase.from("karyawan").select("id, nama, kategori_dokumen").eq("status", "aktif").order("nama"),
      supabase.from("shift_master").select("id, nama_shift"),
    ]);
    const spvRows = (spvRes.data as { sesi: Sesi; karyawan_id: string; karyawan: { nama: string } | null }[] | null) ?? [];
    const kList = (kRes.data as Karyawan[]) ?? [];
    setKaryawanList(kList);
    const shiftMap: Record<string, ShiftMaster> = {};
    ((sRes.data as ShiftMaster[] | null) ?? []).forEach((s) => { shiftMap[s.nama_shift] = s; });
    setShiftByNama(shiftMap);

    const cocok = spvRows.find((r) => r.karyawan?.nama === u.nama);
    if (!cocok) { setStep("notallowed"); return; }
    setSesiUser(cocok.sesi);
    setAuditorId(cocok.karyawan_id);

    const { h, m } = wibHM();
    const nowMin = h * 60 + m;
    const today = todayWIB();
    let tglTugas: string; let bukaWindow: boolean;
    if (cocok.sesi === "malam") {
      tglTugas = today;
      bukaWindow = nowMin >= 19 * 60;
      if (!bukaWindow) setPesanTutup(`Sesi audit malam baru buka jam 19:00 (mengaudit tugas hari ini, ${labelTgl(today)}).`);
    } else {
      tglTugas = addDaysStr(today, -1);
      bukaWindow = nowMin >= 8 * 60 && nowMin < 19 * 60;
      if (!bukaWindow) {
        setPesanTutup(nowMin < 8 * 60
          ? `Sesi audit pagi baru buka jam 08:00 (mengaudit tugas kemarin, ${labelTgl(tglTugas)}).`
          : `Sesi audit pagi untuk ${labelTgl(tglTugas)} sudah lewat batas waktu (terkunci sejak jam 19:00 hari ini).`);
      }
    }
    setTanggalTugas(tglTugas);
    if (!bukaWindow) { setStep("closed"); return; }

    // cek/siapkan sesi
    const { data: sesiExist } = await supabase.from("audit_kebersihan_sesi")
      .select("id, status").eq("tanggal_tugas", tglTugas).eq("sesi", cocok.sesi).maybeSingle();
    const sesiRow = sesiExist as { id: string; status: string } | null;
    if (sesiRow?.status === "selesai") { setSesiId(sesiRow.id); setStep("done"); return; }

    let sid = sesiRow?.id ?? null;
    if (!sid) {
      const { data: ins } = await supabase.from("audit_kebersihan_sesi")
        .insert({ tanggal_tugas: tglTugas, sesi: cocok.sesi, auditor_karyawan_id: cocok.karyawan_id, status: "draft" })
        .select("id").single();
      sid = (ins as { id: string } | null)?.id ?? null;
    }
    setSesiId(sid);

    // baris kebersihan (untuk lookup poin per jalur)
    const { data: kb } = await supabase.from("master_pelanggaran").select("id, jalur, poin").eq("is_kebersihan", true).eq("is_aktif", true);
    setKebersihanRows((kb as MasterKebersihan[] | null) ?? []);

    await muatChecklist(cocok.sesi, tglTugas, shiftMap);
    setStep("form");
  }

  async function muatChecklist(sesi: Sesi, tglTugas: string, shiftMap: Record<string, ShiftMaster>) {
    const shiftPagi = [shiftMap["Shift 3"]?.id, shiftMap["Shift 4"]?.id].filter(Boolean) as string[];
    const shiftMalam = [shiftMap["Shift 1"]?.id, shiftMap["Shift 2"]?.id].filter(Boolean) as string[];
    const shiftGroup = sesi === "pagi" ? shiftPagi : shiftMalam;
    const dow = dayOfWeek(tglTugas);

    const hasil: ItemAudit[] = [];

    // 1) Job Desc Pulang harian — selalu ada
    const { data: roster } = await supabase.from("audit_kebersihan_roster_harian")
      .select("id, karyawan_id, shift_id, nama_tugas, urutan, karyawan:karyawan_id(nama)")
      .eq("tanggal", tglTugas).eq("is_aktif", true)
      .in("shift_id", shiftGroup.length ? shiftGroup : ["-"])
      .order("urutan");
    ((roster as { id: string; karyawan_id: string; shift_id: string | null; nama_tugas: string; karyawan: { nama: string } | null }[] | null) ?? []).forEach((r) => {
      hasil.push({
        key: `roster_${r.id}`, jenis_audit: "harian_pulang", area_label: r.karyawan?.nama ?? null, nama_tugas: r.nama_tugas,
        roster_id: r.id, template_id: null, shift_id: r.shift_id, karyawanDefault: r.karyawan_id,
        status: "lulus", penanggungTipe: "individu", penanggungKaryawanId: r.karyawan_id, catatan: "", fotoFiles: [],
      });
    });

    // 2) Piket — hanya Senin (dow===1)
    if (dow === 1) {
      const { data: tp } = await supabase.from("audit_kebersihan_template")
        .select("id, area_label, nama_tugas, shift_id, urutan").eq("jenis_audit", "piket").eq("is_aktif", true)
        .in("shift_id", shiftGroup.length ? shiftGroup : ["-"]).order("urutan");
      ((tp as { id: string; area_label: string | null; nama_tugas: string; shift_id: string | null }[] | null) ?? []).forEach((t) => {
        hasil.push({
          key: `tpl_${t.id}`, jenis_audit: "piket", area_label: t.area_label, nama_tugas: t.nama_tugas,
          roster_id: null, template_id: t.id, shift_id: t.shift_id, karyawanDefault: null,
          status: "lulus", penanggungTipe: "shift_tidak_pasti", penanggungKaryawanId: "", catatan: "", fotoFiles: [],
        });
      });
    }

    // 3) Deep Clean Area + Alat — hanya Sabtu (dow===6)
    if (dow === 6) {
      const { data: td } = await supabase.from("audit_kebersihan_template")
        .select("id, jenis_audit, area_label, nama_tugas, shift_id, urutan")
        .in("jenis_audit", ["deep_clean_area", "deep_clean_alat"]).eq("is_aktif", true)
        .in("shift_id", shiftGroup.length ? shiftGroup : ["-"]).order("jenis_audit").order("urutan");
      ((td as { id: string; jenis_audit: "deep_clean_area" | "deep_clean_alat"; area_label: string | null; nama_tugas: string; shift_id: string | null }[] | null) ?? []).forEach((t) => {
        hasil.push({
          key: `tpl_${t.id}`, jenis_audit: t.jenis_audit, area_label: t.area_label, nama_tugas: t.nama_tugas,
          roster_id: null, template_id: t.id, shift_id: t.shift_id, karyawanDefault: null,
          status: "lulus", penanggungTipe: "shift_tidak_pasti", penanggungKaryawanId: "", catatan: "", fotoFiles: [],
        });
      });
    }

    setItems(hasil);
  }

  function toggleStatus(key: string) {
    setItems((its) => its.map((it) => it.key === key ? { ...it, status: it.status === "lulus" ? "gagal" : "lulus" } : it));
  }
  function updateItem(key: string, patch: Partial<ItemAudit>) {
    setItems((its) => its.map((it) => it.key === key ? { ...it, ...patch } : it));
  }

  // Pool anggota shift penanggung jawab (utk "shift, tidak dapat dipastikan")
  async function resolvePool(it: ItemAudit): Promise<string[]> {
    if (!it.shift_id) return [];
    let shiftIds = [it.shift_id];
    if (it.jenis_audit === "deep_clean_area") {
      const s1 = shiftByNama["Shift 1"]?.id, s2 = shiftByNama["Shift 2"]?.id, s3 = shiftByNama["Shift 3"]?.id, s4 = shiftByNama["Shift 4"]?.id;
      if (it.shift_id === s1) shiftIds = [s1, s2].filter(Boolean) as string[];
      else if (it.shift_id === s3) shiftIds = [s3, s4].filter(Boolean) as string[];
    }
    const { data } = await supabase.from("shift_assignment").select("karyawan_id")
      .eq("tanggal", tanggalTugas).eq("is_libur", false).in("shift_id", shiftIds);
    return ((data as { karyawan_id: string }[] | null) ?? []).map((r) => r.karyawan_id);
  }

  async function uploadFoto(files: File[], folder: string): Promise<string[]> {
    const urls: string[] = [];
    for (const f of files) {
      const blob = await kompresGambar(f);
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const up = await supabase.storage.from("foto-absensi").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      urls.push(supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  function kebersihanUntukJalur(jalur: string | null): MasterKebersihan | null {
    return kebersihanRows.find((r) => r.jalur === jalur) ?? null;
  }

  async function submitAudit() {
    if (!sesiId || !user) return;
    const gagalTanpaPenanggung = items.find((it) => it.status === "gagal" && it.penanggungTipe === "individu" && !it.penanggungKaryawanId);
    if (gagalTanpaPenanggung) { setErr(`Item "${gagalTanpaPenanggung.nama_tugas}" belum ada penanggung jawab.`); return; }
    setBusy(true); setErr("");
    try {
      let jmlLulus = 0, jmlGagal = 0;
      for (const it of items) {
        const fotoUrls = it.fotoFiles.length ? await uploadFoto(it.fotoFiles, "audit-kebersihan") : [];
        const { data: hasilRow, error: hasilErr } = await supabase.from("audit_kebersihan_hasil").insert({
          sesi_id: sesiId, template_id: it.template_id, roster_harian_id: it.roster_id,
          jenis_audit_snapshot: it.jenis_audit, area_label_snapshot: it.area_label, nama_tugas_snapshot: it.nama_tugas,
          status: it.status,
          penanggung_jawab_tipe: it.status === "gagal" ? it.penanggungTipe : null,
          karyawan_id: it.status === "gagal" && it.penanggungTipe === "individu" ? it.penanggungKaryawanId : null,
          catatan: it.catatan.trim() || null,
          foto_bukti_urls: fotoUrls.length ? fotoUrls : null,
        }).select("id").single();
        if (hasilErr || !hasilRow) throw new Error(hasilErr?.message ?? "Gagal simpan hasil audit");
        const hasilId = (hasilRow as { id: string }).id;

        if (it.status === "lulus") { jmlLulus++; continue; }
        jmlGagal++;

        const nowIso = new Date().toISOString();
        let targetKaryawanIds: { id: string; poinOverride: number | null }[] = [];
        if (it.penanggungTipe === "individu") {
          targetKaryawanIds = [{ id: it.penanggungKaryawanId, poinOverride: null }];
        } else {
          const pool = await resolvePool(it);
          targetKaryawanIds = pool.map((id) => ({ id, poinOverride: 0.5 }));
        }
        for (const t of targetKaryawanIds) {
          const kar = karyawanList.find((k) => k.id === t.id);
          const jalur = jalurDariKategori(kar?.kategori_dokumen ?? null);
          const master = kebersihanUntukJalur(jalur);
          if (!master) continue; // tidak ada kategori kebersihan utk jalur ini, skip aman
          await supabase.from("laporan_pelanggaran").insert({
            karyawan_id: t.id, pelanggaran_id: master.id, tanggal_kejadian: tanggalTugas, jalur,
            dilaporkan_oleh: user.nama, keterangan: `Audit Kebersihan — ${JENIS_LABEL[it.jenis_audit]}${it.area_label ? " · " + it.area_label : ""}: ${it.nama_tugas}`,
            foto_bukti_urls: fotoUrls.length ? fotoUrls : null,
            status: "pending", respon_deadline: hitungResponDeadline(nowIso),
            audit_hasil_id: hasilId, poin_override: t.poinOverride,
          });
        }
      }
      await supabase.from("audit_kebersihan_sesi").update({ status: "selesai", selesai_at: new Date().toISOString() }).eq("id", sesiId);
      setRingkasan({ lulus: jmlLulus, gagal: jmlGagal });
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal submit audit");
    } finally { setBusy(false); }
  }

  const grouped = useMemo(() => {
    const g: Record<string, ItemAudit[]> = {};
    items.forEach((it) => {
      const k = `${it.jenis_audit}|${it.area_label ?? ""}`;
      (g[k] ??= []).push(it);
    });
    return g;
  }, [items]);

  if (step === "loading") return <div className="p-4 text-center text-gray-400 text-sm">Memuat…</div>;
  if (step === "notallowed") return (
    <div className="p-4 max-w-md mx-auto text-center py-16">
      <AlertTriangle className="mx-auto text-amber-400 mb-2" size={28} />
      <p className="text-gray-600 text-sm">Kamu bukan SPV penanggung jawab Audit Kebersihan hari ini.</p>
    </div>
  );
  if (step === "closed") return (
    <div className="p-4 max-w-md mx-auto text-center py-16">
      <AlertTriangle className="mx-auto text-amber-400 mb-2" size={28} />
      <p className="text-gray-600 text-sm">{pesanTutup}</p>
    </div>
  );
  if (step === "done") return (
    <div className="p-4 max-w-md mx-auto text-center py-16">
      <CheckCircle2 className="mx-auto text-green-500 mb-2" size={32} />
      <p className="font-bold text-gray-800">Audit Sudah Diisi</p>
      <p className="text-sm text-gray-500 mt-1">
        {ringkasan.lulus + ringkasan.gagal > 0
          ? `${ringkasan.lulus} lulus, ${ringkasan.gagal} gagal — untuk ${labelTgl(tanggalTugas)}.`
          : `Sesi untuk ${labelTgl(tanggalTugas)} sudah tercatat selesai.`}
      </p>
    </div>
  );

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-32">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={20} className="text-teal-500" />
        <h1 className="text-xl font-bold text-gray-800">Audit Kebersihan — Sesi {sesiUser === "pagi" ? "Pagi" : "Malam"}</h1>
      </div>
      <p className="text-sm text-gray-500">Mengaudit tugas untuk <b>{labelTgl(tanggalTugas)}</b>. Centang = sudah lulus dicek; hilangkan centang kalau ada yang gagal.</p>

      {items.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Tidak ada item checklist untuk hari ini.</p>}

      {Object.entries(grouped).map(([k, its]) => {
        const [jenis, area] = k.split("|");
        return (
          <div key={k} className="card space-y-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase">{JENIS_LABEL[jenis]}{area ? ` — ${area}` : ""}</p>
            {its.map((it) => (
              <div key={it.key} className={`rounded-xl border p-2.5 ${it.status === "gagal" ? "border-red-200 bg-red-50/40" : "border-gray-100"}`}>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={it.status === "lulus"} onChange={() => toggleStatus(it.key)}
                    className="mt-0.5 w-4 h-4 accent-teal-500 shrink-0" />
                  <span className="text-sm text-gray-700 leading-snug">{it.nama_tugas}</span>
                </label>

                {it.status === "gagal" && (
                  <div className="mt-2 ml-6 space-y-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => updateItem(it.key, { penanggungTipe: "individu" })}
                        className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 ${it.penanggungTipe === "individu" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                        <User size={12} /> Individu
                      </button>
                      <button onClick={() => updateItem(it.key, { penanggungTipe: "shift_tidak_pasti", penanggungKaryawanId: "" })}
                        className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 ${it.penanggungTipe === "shift_tidak_pasti" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}>
                        <Users size={12} /> Shift, tidak dapat dipastikan
                      </button>
                    </div>

                    {it.penanggungTipe === "individu" && (
                      <select className="input text-sm" value={it.penanggungKaryawanId} onChange={(e) => updateItem(it.key, { penanggungKaryawanId: e.target.value })}>
                        <option value="">Pilih karyawan…</option>
                        {karyawanList.map((k2) => <option key={k2.id} value={k2.id}>{k2.nama}</option>)}
                      </select>
                    )}
                    {it.penanggungTipe === "shift_tidak_pasti" && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">Setiap anggota shift penanggung jawab area ini kena 0,5 poin.</p>
                    )}

                    <textarea className="input text-sm" rows={2} placeholder="Catatan (opsional)" value={it.catatan}
                      onChange={(e) => updateItem(it.key, { catatan: e.target.value })} />

                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-500 cursor-pointer hover:border-red-200 hover:text-red-500">
                      <Camera size={14} /> Foto bukti (opsional, dari galeri)
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => updateItem(it.key, { fotoFiles: Array.from(e.target.files ?? []) })} />
                    </label>
                    {it.fotoFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {it.fotoFiles.map((f, i) => (
                          <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                            <button onClick={() => updateItem(it.key, { fotoFiles: it.fotoFiles.filter((_, j) => j !== i) })}
                              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {err && <p className="text-sm text-red-500 text-center">{err}</p>}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3">
        <button onClick={submitAudit} disabled={busy || items.length === 0}
          className="w-full max-w-2xl mx-auto block py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-40">
          {busy ? "Mengirim…" : "Submit Audit"}
        </button>
      </div>
    </div>
  );
}
