"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/auth";
import { FileText, Camera, CheckCircle2, X, AlertTriangle } from "lucide-react";
import IndonesianDatePicker from "@/components/IndonesianDatePicker";
import { katLapor, dendaIzinBiasa, labelKatLapor, type KatLapor } from "@/lib/izin";
import { muatAturan, cfgIzin, jalurDariKategori, type CfgIzin } from "@/lib/aturan";

interface Karyawan { id: string; nama: string; jabatan: string | null; kategori_dokumen: string | null }

// "Rabu, 2 Juli 2026" — sertakan nama hari
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
// jam & menit WIB sekarang
function wibHM(): { h: number; m: number } {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
  let [h, m] = s.split(":").map(Number);
  if (h === 24) h = 0;
  return { h, m };
}
// Tanggal izin: default per window (17:00 H-1 → 05:00 H), bisa dipilih hingga 7 hari ke depan.
function computeDates(): { defaultDate: string; minDate: string; maxDate: string } {
  const { h, m } = wibHM();
  const today = todayWIB();
  const besok = addDaysStr(today, 1);
  void h; void m; void besok;
  const defaultDate = today;                       // default ke hari ini
  const minDate     = today;                        // hari ini tetap bisa dipilih sampai 23:59
  const maxDate     = addDaysStr(today, 7);        // sampai 7 hari ke depan
  return { defaultDate, minDate, maxDate };
}

export default function IzinPage() {
  const [step, setStep] = useState<"pin" | "form" | "done">("pin");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [karyawan, setKaryawan] = useState<Karyawan | null>(null);

  const [foto, setFoto] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [doneTgl, setDoneTgl] = useState("");

  const { defaultDate, minDate, maxDate } = computeDates();
  const [tglIzin, setTglIzin] = useState(defaultDate);
  const [showCal, setShowCal] = useState(false);
  const [kuotaOleh, setKuotaOleh] = useState<string | null>(null); // nama karyawan lain yg sudah izin di tgl ini
  const [dendaInfo, setDendaInfo] = useState<{ denda: number; kat: KatLapor; adaShift: boolean } | null>(null);
  const [sudahIzin, setSudahIzin] = useState(false); // karyawan ini sudah lapor izin di tgl terpilih
  const [lewatBatas, setLewatBatas] = useState(false); // hari ini & sudah lewat batas jam setelah shift mulai → tidak bisa izin, otomatis alpha
  const [batasJamSetelahShift, setBatasJamSetelahShift] = useState(2); // diatur di halaman Aturan & Nominal
  const [cfgFull, setCfgFull] = useState<CfgIzin | null>(null); // aturan lengkap Pasal 3a, ditampilkan supaya karyawan baca konsekuensinya

  // Cek kuota (Pasal 3c) + hitung preview denda izin biasa (Pasal 3a) sesuai waktu lapor
  useEffect(() => {
    if (step !== "form" || !karyawan) { setKuotaOleh(null); setDendaInfo(null); setSudahIzin(false); setLewatBatas(false); setCfgFull(null); return; }
    let active = true;
    (async () => {
      const [kRes, sRes, dupRes] = await Promise.all([
        supabase.from("pengajuan_izin").select("karyawan:karyawan_id(nama)")
          .eq("tanggal_izin", tglIzin).eq("jenis", "izin_biasa").eq("status", "aktif").neq("karyawan_id", karyawan.id).limit(1),
        supabase.from("shift_assignment").select("is_libur, shift_master:shift_id(jam_masuk)")
          .eq("karyawan_id", karyawan.id).eq("tanggal", tglIzin).maybeSingle(),
        supabase.from("pengajuan_izin").select("id")
          .eq("karyawan_id", karyawan.id).eq("tanggal_izin", tglIzin).eq("status", "aktif").limit(1),
      ]);
      if (!active) return;
      setSudahIzin(!!(dupRes.data && dupRes.data.length > 0));
      const kuota = (kRes.data?.[0] as { karyawan: { nama: string } | null } | undefined)?.karyawan?.nama ?? null;
      setKuotaOleh(kuota);
      // Aturan yang dipakai = yang berlaku pada TANGGAL IZIN (tanggal kejadian)
      const rows = await muatAturan();
      const jalur = jalurDariKategori(karyawan.kategori_dokumen) ?? "training";
      const cfg = cfgIzin(rows, jalur, tglIzin);
      setCfgFull(cfg);
      const saRow = sRes.data as { is_libur: boolean; shift_master: { jam_masuk: string } | null } | null;
      if (saRow && !saRow.is_libur && saRow.shift_master) {
        const kat = katLapor(tglIzin, saRow.shift_master.jam_masuk, Date.now(), cfg);
        setDendaInfo({ denda: dendaIzinBiasa(kat, false, cfg), kat, adaShift: true });
        // Batas lapor izin di hari yang sama: sekian jam setelah shift mulai (diatur di Aturan & Nominal)
        const jm = saRow.shift_master.jam_masuk.slice(0, 8).padEnd(8, ":00");
        const shiftStart = new Date(`${tglIzin}T${jm}+07:00`).getTime();
        const batasJam = cfg.batas_jam_setelah_shift ?? 2;
        setBatasJamSetelahShift(batasJam);
        setLewatBatas(tglIzin === todayWIB() && Date.now() > shiftStart + batasJam * 3600_000);
      } else {
        setDendaInfo({ denda: 0, kat: "tepat_waktu", adaShift: false });
        setBatasJamSetelahShift(cfg.batas_jam_setelah_shift ?? 2);
        setLewatBatas(false);
      }
    })();
    return () => { active = false; };
  }, [tglIzin, karyawan, step]);

  async function submitPin() {
    setPinErr("");
    if (!/^\d{6}$/.test(pin)) { setPinErr("PIN harus 6 digit"); return; }
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data: k } = await supabase.from("karyawan")
        .select("id, nama, jabatan, kategori_dokumen").eq("pin_absensi", hash).eq("status", "aktif").maybeSingle();
      if (!k) { setPinErr("PIN tidak ditemukan"); return; }
      setKaryawan(k as Karyawan);
      setStep("form");
    } catch { setPinErr("Terjadi kesalahan, coba lagi"); }
    finally { setBusy(false); }
  }

  function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoFile(f);
    setFoto(URL.createObjectURL(f));
  }

  async function submit() {
    if (!karyawan || !tglIzin) return;
    if (lewatBatas) { setErr(`Sudah lewat ${batasJamSetelahShift} jam setelah shift mulai — tidak bisa lapor izin untuk hari ini (otomatis Alpha).`); return; }
    setErr(""); setBusy(true);
    try {
      const tgl = tglIzin;
      // Cek duplikat izin aktif
      const { data: dup } = await supabase.from("pengajuan_izin")
        .select("id").eq("karyawan_id", karyawan.id).eq("tanggal_izin", tgl).eq("status", "aktif").maybeSingle();
      if (dup) { setErr("Kamu sudah lapor izin untuk tanggal ini."); setBusy(false); return; }

      // Foto bukti opsional untuk izin biasa
      let fotoUrl: string | null = null;
      if (fotoFile) {
        const path = `izin/${karyawan.id}/${tgl}_${Date.now()}.jpg`;
        const up = await supabase.storage.from("foto-absensi").upload(path, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: true });
        if (up.error) throw new Error("Gagal upload foto: " + up.error.message);
        fotoUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;
      }

      // Pasal 3a + 3c: hitung denda izin biasa berdasarkan waktu lapor vs shift pada tanggal izin
      let denda = 0; let kategori: string | null = null;
      const { data: sa } = await supabase.from("shift_assignment")
        .select("is_libur, shift_master:shift_id(jam_masuk)")
        .eq("karyawan_id", karyawan.id).eq("tanggal", tgl).maybeSingle();
      const saRow = sa as { is_libur: boolean; shift_master: { jam_masuk: string } | null } | null;
      if (saRow && !saRow.is_libur && saRow.shift_master) {
        const rows = await muatAturan();
        const jalur = jalurDariKategori(karyawan.kategori_dokumen) ?? "training";
        const cfg = cfgIzin(rows, jalur, tgl);
        const kat = katLapor(tgl, saRow.shift_master.jam_masuk, Date.now(), cfg);
        kategori = kat;
        denda = dendaIzinBiasa(kat, !!kuotaOleh, cfg);
      }

      // Insert pengajuan izin
      const { error: insErr } = await supabase.from("pengajuan_izin").insert({
        karyawan_id: karyawan.id, tanggal_izin: tgl, jenis: "izin_biasa",
        foto_bukti_url: fotoUrl, status: "aktif",
        denda, kategori_lapor: kategori, kuota_penuh: !!kuotaOleh,
      });
      if (insErr) throw new Error(insErr.message);

      // Set absensi status izin (cegah auto-alpha) — jangan timpa jika sudah check-in
      const { data: ab } = await supabase.from("absensi")
        .select("id, jam_checkin").eq("karyawan_id", karyawan.id).eq("tanggal", tgl).maybeSingle();
      const abRow = ab as { id: string; jam_checkin: string | null } | null;
      if (!abRow) {
        await supabase.from("absensi").insert({
          karyawan_id: karyawan.id, tanggal: tgl, status_kehadiran: "izin", denda,
        });
      } else if (!abRow.jam_checkin) {
        await supabase.from("absensi").update({ status_kehadiran: "izin", denda }).eq("id", abRow.id);
      }
      // jika sudah check-in → biarkan hadir (check-in override izin)

      setDoneTgl(tgl);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal lapor izin");
    } finally { setBusy(false); }
  }

  function reset() { setStep("pin"); setPin(""); setPinErr(""); setKaryawan(null); setFoto(null); setFotoFile(null); setErr(""); setTglIzin(defaultDate); setShowCal(false); }

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-14 h-14 object-contain rounded-full mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Lapor Izin</h1>
          <p className="text-sm text-gray-500">Cane RawtheR</p>
        </div>

        {/* STEP 1 — PIN */}
        {step === "pin" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Masukkan PIN Absensi</label>
            <input inputMode="numeric" maxLength={6} autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border-2 border-gray-200 focus:border-sky-400 outline-none"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()} placeholder="••••••" />
            {pinErr && <p className="text-sm text-red-500 text-center">{pinErr}</p>}
            <button onClick={submitPin} disabled={busy || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-600 disabled:opacity-40 transition-colors">
              {busy ? "Memeriksa..." : "Lanjut"}
            </button>
          </div>
        )}

        {/* STEP 2 — FORM */}
        {step === "form" && karyawan && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-800">{karyawan.nama}</p>
              <p className="text-xs text-gray-500">{karyawan.jabatan ?? "—"}</p>
            </div>

            {(
              <>
                <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-center">
                  <p className="text-xs text-gray-500">Izin untuk tanggal</p>
                  <p className="text-lg font-bold text-sky-700">{labelTgl(tglIzin)}</p>
                  <button type="button" onClick={() => setShowCal((v) => !v)} className="text-xs font-semibold text-sky-600 hover:text-sky-700 mt-1">
                    {showCal ? "Tutup kalender" : "Ubah tanggal (bisa sampai 7 hari ke depan)"}
                  </button>
                  {showCal && (
                    <div className="mt-2 text-left">
                      <IndonesianDatePicker value={tglIzin} accent="sky" minDate={minDate} maxDate={maxDate}
                        onChange={(v) => { setTglIzin(v); setShowCal(false); }} />
                    </div>
                  )}
                </div>

                {!sudahIzin && cfgFull && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700 space-y-2">
                    <p className="font-bold text-gray-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-500" /> Pasal 3a — Baca dulu konsekuensi izin biasa
                    </p>
                    <table className="w-full">
                      <tbody>
                        <tr className={dendaInfo?.kat === "tepat_waktu" ? "text-sky-700 font-semibold" : ""}>
                          <td className="py-1 pr-2">Lapor tepat waktu (sebelum deadline)</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            Rp {cfgFull.tepat_waktu.denda.toLocaleString("id-ID")}{cfgFull.tepat_waktu.poin ? ` + ${cfgFull.tepat_waktu.poin} poin` : ""}
                          </td>
                        </tr>
                        <tr className={dendaInfo?.kat === "telat_sebelum_shift" ? "text-amber-700 font-semibold" : ""}>
                          <td className="py-1 pr-2">Lapor telat (lewat deadline, tapi sebelum shift mulai)</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            Rp {cfgFull.telat_sebelum_shift.denda.toLocaleString("id-ID")}{cfgFull.telat_sebelum_shift.poin ? ` + ${cfgFull.telat_sebelum_shift.poin} poin` : ""}
                          </td>
                        </tr>
                        <tr className={dendaInfo?.kat === "setelah_shift" ? "text-orange-700 font-semibold" : ""}>
                          <td className="py-1 pr-2">Lapor setelah shift mulai (maks {batasJamSetelahShift} jam)</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            Rp {cfgFull.setelah_shift.denda.toLocaleString("id-ID")}{cfgFull.setelah_shift.poin ? ` + ${cfgFull.setelah_shift.poin} poin` : ""}
                          </td>
                        </tr>
                        <tr className="text-red-600 font-semibold">
                          <td className="py-1 pr-2">Lewat {batasJamSetelahShift} jam setelah shift mulai / tidak lapor sama sekali</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            Otomatis Alpha — Rp {cfgFull.alpha.denda.toLocaleString("id-ID")}{cfgFull.alpha.poin ? ` + ${cfgFull.alpha.poin} poin` : ""}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-gray-500">
                      Kuota izin tanpa tambahan denda: maksimal <b>{cfgFull.kuota_izin_per_hari} orang/hari</b>. Kalau kuota sudah penuh, ada tambahan denda <b>Rp {cfgFull.denda_tambahan_kuota_penuh.toLocaleString("id-ID")}</b> di luar denda kategori di atas.
                    </p>
                  </div>
                )}

                {sudahIzin && (
                  <div className="rounded-xl bg-emerald-50 border-2 border-emerald-300 p-3 text-sm text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>Kamu <b>sudah lapor izin</b> untuk hari <b>{labelTgl(tglIzin)}</b>. Menunggu verifikasi Super Admin. Pilih tanggal lain jika ingin izin di hari berbeda.</span>
                  </div>
                )}

                {!sudahIzin && lewatBatas && (
                  <div className="rounded-xl bg-red-50 border-2 border-red-300 p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Batas lapor izin untuk hari ini adalah <b>{batasJamSetelahShift} jam setelah shift mulai</b>. Waktu itu sudah lewat, jadi kamu <b>tidak bisa lapor izin</b> untuk hari ini dan otomatis dihitung <b>Alpha</b>. Untuk izin, pilih tanggal berikutnya.</span>
                  </div>
                )}

                {!sudahIzin && !lewatBatas && dendaInfo?.adaShift && (
                  <div className="rounded-xl bg-amber-50 border-2 border-amber-300 p-3 text-xs text-amber-800 space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-500" /> Kalau submit sekarang</p>
                    <p>
                      Waktu lapor kamu sekarang terhitung <b>{labelKatLapor(dendaInfo.kat).toLowerCase()}</b>, jadi denda yang berlaku <b>Rp {dendaInfo.denda.toLocaleString("id-ID")}</b> (lihat tabel Pasal 3a di atas).
                    </p>
                    {kuotaOleh && (
                      <p className="text-red-700">⚠️ Sudah ada karyawan lain (<b>{kuotaOleh}</b>) yang izin di tanggal ini — kuota harian ({cfgFull?.kuota_izin_per_hari ?? 1} orang) terisi, jadi ada <b>tambahan Rp{(cfgFull?.denda_tambahan_kuota_penuh ?? 100000).toLocaleString("id-ID")}</b>. Total denda kamu jadi <b>Rp {(dendaInfo.denda + (cfgFull?.denda_tambahan_kuota_penuh ?? 100000)).toLocaleString("id-ID")}</b>. Disarankan pilih tanggal lain atau tetap masuk.</p>
                    )}
                  </div>
                )}

                {!sudahIzin && !lewatBatas && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                  Kalau ingin izin lebih dari 1 hari, kamu harus lapor lagi untuk tiap tanggalnya.
                </div>
                )}
                {!sudahIzin && !lewatBatas && (
                <>
                {/* Foto bukti — opsional */}
                {foto ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto} alt="bukti izin" className="w-full rounded-xl border border-gray-200 max-h-72 object-contain bg-gray-900" />
                    <label className="block">
                      <span className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                        <Camera size={16} /> Ganti Foto
                      </span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pilihFoto} />
                    </label>
                  </div>
                ) : (
                  <label className="block">
                    <span className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                      <Camera size={16} /> Foto Bukti Tulisan (opsional)
                    </span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pilihFoto} />
                  </label>
                )}

                {err && <p className="text-sm text-red-500">{err}</p>}

                <button onClick={submit} disabled={busy}
                  className="w-full py-3 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-600 disabled:opacity-40 flex items-center justify-center gap-2">
                  <FileText size={18} /> {busy ? "Mengirim..." : (kuotaOleh ? "Tetap Lapor Izin" : "Lapor Izin")}
                </button>
                </>
                )}
              </>
            )}

            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">Ganti karyawan</button>
          </div>
        )}

        {/* STEP 3 — DONE */}
        {step === "done" && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <p className="font-bold text-gray-800">Izin Berhasil Di Submit</p>
            <p className="text-sm text-gray-600">Izin untuk hari <b>{labelTgl(doneTgl)}</b> sudah tercatat. Menunggu verifikasi Super Admin.</p>
            <button onClick={reset} className="w-full py-3 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-600">Selesai</button>
          </div>
        )}

        <button onClick={() => (window.location.href = "/login")} className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
          <X size={14} /> Kembali
        </button>
      </div>
    </div>
  );
}
