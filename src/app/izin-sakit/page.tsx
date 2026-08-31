"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/auth";
import { Stethoscope, Camera, CheckCircle2, X, AlertTriangle, Clock } from "lucide-react";
import { bulanRange } from "@/lib/absensi";
import { katLapor, dendaIzinSakit, jamSebelumByMasuk } from "@/lib/izin";
import { muatAturan, cfgIzin, cfgSakit, jalurDariKategori, type CfgSakit } from "@/lib/aturan";

interface Karyawan { id: string; nama: string; jabatan: string | null; kategori_dokumen: string | null }
interface ShiftHari { nama_shift: string; jam_masuk: string; jam_pulang: string }
interface SakitAktif { id: string; tanggal_izin: string; status_surat: string | null; kategori_lapor: string | null; sakit_ke: number | null; batas_upload_surat: string | null }

function labelTgl(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
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
function jamToMin(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function minToJam(min: number) { const h = Math.floor(min / 60) % 24; const m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
// Jam "tepat waktu" lapor sakit = sekian jam sebelum shift mulai (Pasal 3, sesuai aturan yang berlaku)
function deadlineLapor(jamMasuk: string, cfg: CfgSakit): string {
  const jamSebelum = jamSebelumByMasuk(jamMasuk, cfg);
  const totalMin = ((jamToMin(jamMasuk.slice(0, 5)) - jamSebelum * 60) % 1440 + 1440) % 1440;
  return minToJam(totalMin);
}

export default function IzinSakitPage() {
  const [step, setStep] = useState<"pin" | "form" | "susulan" | "done">("pin");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);

  const [tanggalH, setTanggalH] = useState<string | null>(null);
  const [shiftHari, setShiftHari] = useState<ShiftHari | null>(null);
  const [windowErr, setWindowErr] = useState("");   // pesan bila di luar window
  const [susulan, setSusulan] = useState<SakitAktif | null>(null);

  const [foto, setFoto] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [cfgFull, setCfgFull] = useState<CfgSakit | null>(null);

  async function submitPin() {
    setPinErr("");
    if (!/^\d{6}$/.test(pin)) { setPinErr("PIN harus 6 digit"); return; }
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data: k } = await supabase.from("karyawan")
        .select("id, nama, jabatan, kategori_dokumen").eq("pin_absensi", hash).eq("status", "aktif").maybeSingle();
      if (!k) { setPinErr("PIN tidak ditemukan"); return; }
      const kar = k as Karyawan;
      setKaryawan(kar);

      // 1) Cek sakit aktif yang masih menunggu surat (susulan)
      const { data: sk } = await supabase.from("pengajuan_izin")
        .select("id, tanggal_izin, status_surat, kategori_lapor, sakit_ke, batas_upload_surat")
        .eq("karyawan_id", kar.id).eq("jenis", "izin_sakit").eq("status", "aktif")
        .eq("status_surat", "menunggu_surat").gte("tanggal_izin", todayWIB())
        .order("tanggal_izin", { ascending: true }).limit(1).maybeSingle();
      if (sk) { setSusulan(sk as SakitAktif); setStep("susulan"); return; }

      // 2) Tentukan tanggal-H + shift + window
      // Mulai jam 18:00 (6 sore) hari sebelumnya, lapor sakit dianggap untuk shift BESOK.
      const { h } = wibHM();
      const today = todayWIB();
      const H = h >= 18 ? addDaysStr(today, 1) : today;
      setTanggalH(H);
      const { data: sa } = await supabase.from("shift_assignment")
        .select("is_libur, shift_master:shift_id(nama_shift, jam_masuk, jam_pulang)")
        .eq("karyawan_id", kar.id).eq("tanggal", H).maybeSingle();
      const saRow = sa as { is_libur: boolean; shift_master: ShiftHari | null } | null;
      const shift = saRow?.is_libur ? null : (saRow?.shift_master ?? null);
      setShiftHari(shift);

      if (!shift) {
        setWindowErr("Kamu tidak ada jadwal shift (atau libur) pada tanggal ini, tidak perlu lapor sakit.");
        setCfgFull(null);
      } else {
        // Aturan yang dipakai = yang berlaku pada TANGGAL SAKIT (tanggal kejadian)
        const rows = await muatAturan();
        const jalur = jalurDariKategori(kar.kategori_dokumen) ?? "training";
        const cfg = cfgSakit(rows, jalur, H);
        setCfgFull(cfg);
        if (H === today) {
          const { h: nh, m: nm } = wibHM();
          const nowMin = nh * 60 + nm;
          // Batas lapor sakit di hari yang sama: sekian jam setelah shift mulai (diatur di Aturan & Nominal)
          const batasJam = cfg.batas_jam_setelah_shift ?? 2;
          const cutoffMin = jamToMin(shift.jam_masuk.slice(0, 5)) + batasJam * 60;
          if (nowMin > cutoffMin) {
            setWindowErr(`Batas lapor sakit untuk hari ini adalah ${batasJam} jam setelah shift mulai (jam ${minToJam(cutoffMin)}). Saat ini sudah lewat, jadi kamu tidak bisa lapor sakit dan otomatis dihitung Alpha.`);
          } else setWindowErr("");
        } else setWindowErr("");
      }
      setStep("form");
    } catch { setPinErr("Terjadi kesalahan, coba lagi"); }
    finally { setBusy(false); }
  }

  function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFotoFile(f); setFoto(URL.createObjectURL(f));
  }

  async function uploadFotoSurat(karyawanId: string, tgl: string): Promise<string> {
    const path = `izin/${karyawanId}/sakit_${tgl}_${Date.now()}.jpg`;
    const up = await supabase.storage.from("foto-absensi").upload(path, fotoFile!, { contentType: fotoFile!.type || "image/jpeg", upsert: true });
    if (up.error) throw new Error("Gagal upload surat: " + up.error.message);
    return supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;
  }

  // Lapor sakit (tahap 1) — surat boleh langsung / menyusul
  async function submitLapor() {
    if (!karyawan || !tanggalH || !shiftHari || windowErr) return;
    setErr(""); setBusy(true);
    try {
      const H = tanggalH;
      const { data: dup } = await supabase.from("pengajuan_izin")
        .select("id").eq("karyawan_id", karyawan.id).eq("tanggal_izin", H).eq("status", "aktif").maybeSingle();
      if (dup) { setErr("Kamu sudah lapor izin/sakit untuk tanggal ini."); setBusy(false); return; }

      const batas = new Date(`${H}T20:00:00+07:00`).toISOString();
      let fotoUrl: string | null = null;
      let statusSurat = "menunggu_surat";
      if (fotoFile) { fotoUrl = await uploadFotoSurat(karyawan.id, H); statusSurat = "surat_masuk"; }

      // Pasal 3b: sakit ke-berapa bulan ini + kategori waktu lapor + denda
      const { start, end } = bulanRange(H);
      const { count: sakitSebelum } = await supabase.from("pengajuan_izin")
        .select("id", { count: "exact", head: true })
        .eq("karyawan_id", karyawan.id).eq("jenis", "izin_sakit").eq("status", "aktif")
        .gte("tanggal_izin", start).lte("tanggal_izin", end);
      const sakitKe = (sakitSebelum ?? 0) + 1;
      // Aturan yang dipakai = yang berlaku pada TANGGAL SAKIT (tanggal kejadian)
      const rows = await muatAturan();
      const jalur = jalurDariKategori(karyawan.kategori_dokumen) ?? "training";
      const cS = cfgSakit(rows, jalur, H), cI = cfgIzin(rows, jalur, H);
      const kat = katLapor(H, shiftHari.jam_masuk, Date.now(), cS);
      const denda = dendaIzinSakit(kat, sakitKe, !!fotoFile, cS, cI);

      const { error: insErr } = await supabase.from("pengajuan_izin").insert({
        karyawan_id: karyawan.id, tanggal_izin: H, jenis: "izin_sakit", status: "aktif",
        foto_surat_url: fotoUrl, status_surat: statusSurat, batas_upload_surat: batas,
        surat_uploaded_at: fotoFile ? new Date().toISOString() : null,
        denda, kategori_lapor: kat, sakit_ke: sakitKe,
      });
      if (insErr) throw new Error(insErr.message);

      // Set absensi izin_sakit (cegah auto-alpha), jangan timpa jika sudah check-in
      const { data: ab } = await supabase.from("absensi")
        .select("id, jam_checkin").eq("karyawan_id", karyawan.id).eq("tanggal", H).maybeSingle();
      const abRow = ab as { id: string; jam_checkin: string | null } | null;
      if (!abRow) {
        await supabase.from("absensi").insert({ karyawan_id: karyawan.id, tanggal: H, status_kehadiran: "izin_sakit", denda });
      } else if (!abRow.jam_checkin) {
        await supabase.from("absensi").update({ status_kehadiran: "izin_sakit", denda }).eq("id", abRow.id);
      }

      setDoneMsg(fotoFile
        ? `Lapor sakit untuk ${labelTgl(H)} berhasil. Surat dokter sudah diterima.`
        : `Lapor sakit untuk ${labelTgl(H)} berhasil. Jangan lupa upload surat dokter maksimal jam 20:00 hari ini.`);
      setStep("done");
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal lapor sakit"); }
    finally { setBusy(false); }
  }

  // Upload surat susulan
  async function submitSusulan() {
    if (!karyawan || !susulan || !fotoFile) return;
    setErr(""); setBusy(true);
    try {
      const fotoUrl = await uploadFotoSurat(karyawan.id, susulan.tanggal_izin);
      // Surat masuk sebelum 20:00 → recompute denda (Pasal 3b: bisa jadi Rp0 jika sakit pertama & tepat waktu)
      const suratOnTime = !susulan.batas_upload_surat || Date.now() <= new Date(susulan.batas_upload_surat).getTime();
      const kat = (susulan.kategori_lapor as import("@/lib/izin").KatLapor) ?? "tepat_waktu";
      const rowsS = await muatAturan();
      const jalurS = jalurDariKategori(karyawan.kategori_dokumen) ?? "training";
      const cS2 = cfgSakit(rowsS, jalurS, susulan.tanggal_izin);
      const cI2 = cfgIzin(rowsS, jalurS, susulan.tanggal_izin);
      const dendaBaru = dendaIzinSakit(kat, susulan.sakit_ke ?? 1, suratOnTime, cS2, cI2);
      await supabase.from("pengajuan_izin").update({
        foto_surat_url: fotoUrl, status_surat: "surat_masuk", surat_uploaded_at: new Date().toISOString(), denda: dendaBaru,
      }).eq("id", susulan.id);
      await supabase.from("absensi").update({ denda: dendaBaru }).eq("karyawan_id", karyawan.id).eq("tanggal", susulan.tanggal_izin);
      setDoneMsg(`Surat dokter untuk ${labelTgl(susulan.tanggal_izin)} berhasil diupload.`);
      setStep("done");
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal upload surat"); }
    finally { setBusy(false); }
  }

  function reset() {
    setStep("pin"); setPin(""); setPinErr(""); setKaryawan(null); setFoto(null); setFotoFile(null);
    setErr(""); setTanggalH(null); setShiftHari(null); setWindowErr(""); setSusulan(null); setCfgFull(null);
  }

  const FotoPicker = ({ label }: { label: string }) => (
    foto ? (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt="surat" className="w-full rounded-xl border border-gray-200 max-h-72 object-contain bg-gray-900" />
        <label className="block">
          <span className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 cursor-pointer"><Camera size={16} /> Ganti Foto</span>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pilihFoto} />
        </label>
      </div>
    ) : (
      <label className="block">
        <span className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 cursor-pointer"><Camera size={16} /> {label}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pilihFoto} />
      </label>
    )
  );

  return (
    <div className="min-h-screen bg-teal-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-14 h-14 object-contain rounded-full mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Lapor Izin Sakit</h1>
          <p className="text-sm text-gray-500">Cane RawtheR</p>
        </div>

        {step === "pin" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Masukkan PIN Absensi</label>
            <input inputMode="numeric" maxLength={6} autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border-2 border-gray-200 focus:border-teal-400 outline-none"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()} placeholder="••••••" />
            {pinErr && <p className="text-sm text-red-500 text-center">{pinErr}</p>}
            <button onClick={submitPin} disabled={busy || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-40 transition-colors">
              {busy ? "Memeriksa..." : "Lanjut"}
            </button>
          </div>
        )}

        {step === "form" && karyawan && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-800">{karyawan.nama}</p>
              <p className="text-xs text-gray-500">{karyawan.jabatan ?? "—"}</p>
            </div>

            {windowErr ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center space-y-2">
                <AlertTriangle size={24} className="text-amber-500 mx-auto" />
                <p className="text-sm text-amber-700">{windowErr}</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-center">
                  <p className="text-xs text-gray-500">Lapor sakit untuk tanggal</p>
                  <p className="text-lg font-bold text-teal-700">{labelTgl(tanggalH!)}</p>
                  {shiftHari && cfgFull && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
                      <Clock size={12} /> {shiftHari.nama_shift} · batas lapor tepat waktu {deadlineLapor(shiftHari.jam_masuk, cfgFull)}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-600">
                  Surat dokter/klinik/RS <b>wajib</b> diupload maksimal <b>jam 20:00 hari ini</b>. Jika tidak, status menjadi <b>Alpha</b>.
                </div>

                <FotoPicker label="Upload Surat Dokter (opsional sekarang)" />
                {err && <p className="text-sm text-red-500">{err}</p>}

                <button onClick={submitLapor} disabled={busy}
                  className="w-full py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-40 flex items-center justify-center gap-2">
                  <Stethoscope size={18} /> {busy ? "Mengirim..." : (fotoFile ? "Lapor Sakit + Surat" : "Lapor Sakit Dulu (surat menyusul)")}
                </button>
              </>
            )}
            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">Ganti karyawan</button>
          </div>
        )}

        {step === "susulan" && karyawan && susulan && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-800">{karyawan.nama}</p>
              <p className="text-xs text-gray-500">Upload surat dokter</p>
            </div>
            <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 text-center">
              <p className="text-xs text-gray-500">Sakit tanggal</p>
              <p className="text-base font-bold text-teal-700">{labelTgl(susulan.tanggal_izin)}</p>
              <p className="text-[11px] text-red-500 mt-1">Belum ada surat — upload maksimal jam 20:00 hari sakit.</p>
            </div>
            <FotoPicker label="Upload Surat Dokter (Wajib)" />
            {err && <p className="text-sm text-red-500">{err}</p>}
            <button onClick={submitSusulan} disabled={busy || !fotoFile}
              className="w-full py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-40 flex items-center justify-center gap-2">
              <Camera size={18} /> {busy ? "Mengunggah..." : "Kirim Surat Dokter"}
            </button>
            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">Ganti karyawan</button>
          </div>
        )}

        {step === "done" && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <p className="font-bold text-gray-800">Berhasil</p>
            <p className="text-sm text-gray-600">{doneMsg}</p>
            <button onClick={reset} className="w-full py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600">Selesai</button>
          </div>
        )}

        <button onClick={() => (window.location.href = "/login")} className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
          <X size={14} /> Kembali
        </button>
      </div>
    </div>
  );
}
