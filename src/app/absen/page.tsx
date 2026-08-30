"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/auth";
import { hitungDenda, bulanRange } from "@/lib/absensi";
import { muatAturan, cfgTelat, jalurDariKategori } from "@/lib/aturan";
import { poinTelat } from "@/lib/poin";
import { Clock, MapPin, Camera, CheckCircle2, LogIn, LogOut, X, RefreshCw } from "lucide-react";

interface Karyawan { id: string; nama: string; jabatan: string | null; kategori_dokumen: string | null }
interface ShiftInfo { nama_shift: string; jam_masuk: string; jam_pulang: string }
interface AbsensiRow {
  id: string; jam_checkin: string | null; jam_checkout: string | null;
}
interface OpenSession {
  id: string; tanggal: string; jam_checkin: string;
  shift: { nama_shift: string; jam_pulang: string } | null;
}
interface Setting { latitude_dapur: number; longitude_dapur: number; radius_meter: number }

// Window checkout wajar = sampai N jam setelah jam_pulang shift
const CHECKOUT_WINDOW_JAM = 8;
// Batas akhir window checkout (ms epoch) untuk sebuah sesi open
function checkoutWindowEnd(s: OpenSession): number {
  if (s.shift?.jam_pulang) {
    const end = new Date(`${s.tanggal}T${s.shift.jam_pulang}+07:00`).getTime();
    return end + CHECKOUT_WINDOW_JAM * 3600_000;
  }
  // tanpa shift: 12 jam sejak check-in
  return new Date(s.jam_checkin).getTime() + 12 * 3600_000;
}

// Haversine — jarak antara 2 koordinat dalam meter
function hitungJarak(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayWIB() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); }
const ID_BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function tglLabel(iso: string) { const [y,m,d] = iso.split("-").map(Number); return `${d} ${ID_BULAN[m-1]} ${y}`; }
function jamWIB(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
}

export default function AbsenPage() {
  const [step, setStep] = useState<"pin" | "status" | "checkin" | "checkout">("pin");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [karyawan, setKaryawan]   = useState<Karyawan | null>(null);
  const [shift, setShift]         = useState<ShiftInfo | null>(null);
  const [absensi, setAbsensi]     = useState<AbsensiRow | null>(null);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [setting, setSetting]     = useState<Setting | null>(null);

  // jam real-time
  const [now, setNow] = useState(() => jamWIB());
  useEffect(() => { const id = setInterval(() => setNow(jamWIB()), 1000); return () => clearInterval(id); }, []);

  async function submitPin() {
    setPinErr("");
    if (!/^\d{6}$/.test(pin)) { setPinErr("PIN harus 6 digit"); return; }
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data: k } = await supabase.from("karyawan")
        .select("id, nama, jabatan, kategori_dokumen").eq("pin_absensi", hash).eq("status", "aktif").maybeSingle();
      if (!k) { setPinErr("PIN tidak ditemukan"); setBusy(false); return; }
      const kar = k as Karyawan;
      setKaryawan(kar);
      await loadStatus(kar.id);
      setStep("status");
    } catch {
      setPinErr("Terjadi kesalahan, coba lagi");
    } finally {
      setBusy(false);
    }
  }

  async function loadStatus(karyawanId: string) {
    const today = todayWIB();
    const [sa, ab, st, open] = await Promise.all([
      supabase.from("shift_assignment")
        .select("is_libur, shift_master:shift_id(nama_shift, jam_masuk, jam_pulang)")
        .eq("karyawan_id", karyawanId).eq("tanggal", today).maybeSingle(),
      supabase.from("absensi")
        .select("id, jam_checkin, jam_checkout")
        .eq("karyawan_id", karyawanId).eq("tanggal", today).maybeSingle(),
      supabase.from("pengaturan_absensi").select("latitude_dapur, longitude_dapur, radius_meter").limit(1).maybeSingle(),
      // Sesi open terakhir (sudah check-in, belum checkout, belum di-flag) — lintas tanggal
      supabase.from("absensi")
        .select("id, tanggal, jam_checkin, shift_master:shift_id(nama_shift, jam_pulang)")
        .eq("karyawan_id", karyawanId)
        .not("jam_checkin", "is", null).is("jam_checkout", null).eq("is_checkout_flagged", false)
        .order("tanggal", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const saData = sa.data as { is_libur: boolean; shift_master: ShiftInfo | null } | null;
    setShift(saData?.is_libur ? null : (saData?.shift_master ?? null));
    setAbsensi((ab.data as AbsensiRow | null) ?? null);
    setSetting((st.data as Setting | null) ?? null);

    // Evaluasi sesi open
    const openRow = open.data as { id: string; tanggal: string; jam_checkin: string; shift_master: { nama_shift: string; jam_pulang: string } | null } | null;
    if (openRow) {
      const sess: OpenSession = { id: openRow.id, tanggal: openRow.tanggal, jam_checkin: openRow.jam_checkin, shift: openRow.shift_master };
      if (Date.now() <= checkoutWindowEnd(sess)) {
        // Masih dalam window → wajib checkout dulu
        setOpenSession(sess);
        return;
      }
      // Lewat window → lupa checkout: flag sesi lama, izinkan check-in baru
      await supabase.from("absensi")
        .update({ is_checkout_flagged: true, flag_reason_checkout: "lupa_checkout" })
        .eq("id", sess.id);
    }
    setOpenSession(null);
  }

  function reset() {
    setStep("pin"); setPin(""); setPinErr(""); setKaryawan(null); setShift(null); setAbsensi(null); setOpenSession(null);
  }

  // status hari ini (sesi open ditangani lewat openSession)
  const sudahCheckout = !!absensi?.jam_checkin && !!absensi?.jam_checkout;

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-5">
          <img src="/logo-cane.png" alt="Cane RawtheR" className="w-14 h-14 object-contain rounded-full mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Absensi Karyawan</h1>
          <p className="text-sm text-gray-500">Cane RawtheR</p>
          <p className="text-2xl font-bold text-amber-600 mt-2 tabular-nums">{now} <span className="text-sm font-normal text-gray-400">WIB</span></p>
        </div>

        {/* STEP 1 — PIN */}
        {step === "pin" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <label className="block text-sm font-medium text-gray-700">Masukkan PIN Absensi</label>
            <input
              inputMode="numeric" maxLength={6} autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border-2 border-gray-200 focus:border-amber-400 outline-none"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              placeholder="••••••"
            />
            {pinErr && <p className="text-sm text-red-500 text-center">{pinErr}</p>}
            <button onClick={submitPin} disabled={busy || pin.length !== 6}
              className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-40 transition-colors">
              {busy ? "Memeriksa..." : "Lanjut"}
            </button>
          </div>
        )}

        {/* STEP 2 — STATUS */}
        {step === "status" && karyawan && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-800">{karyawan.nama}</p>
              <p className="text-xs text-gray-500">{karyawan.jabatan ?? "—"}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm bg-gray-50 rounded-full px-3 py-1">
                <Clock size={14} className="text-amber-500" />
                {shift ? `${shift.nama_shift} (${shift.jam_masuk.slice(0, 5)} - ${shift.jam_pulang.slice(0, 5)})` : "Belum ada jadwal hari ini"}
              </div>
            </div>

            {openSession ? (
              <>
                {openSession.tanggal === todayWIB() ? (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center text-sm text-gray-600">
                    Sudah check-in jam <b>{jamWIB(openSession.jam_checkin)}</b>. Jangan lupa check-out.
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center text-sm text-amber-700">
                    Kamu belum <b>check-out</b> dari shift <b>{tglLabel(openSession.tanggal)}</b>
                    {openSession.shift ? ` (${openSession.shift.nama_shift})` : ""}. Silakan check-out dulu.
                  </div>
                )}
                <button onClick={() => setStep("checkout")}
                  className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 flex items-center justify-center gap-2">
                  <LogOut size={18} /> Check Out
                </button>
              </>
            ) : sudahCheckout ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-1">
                <CheckCircle2 size={28} className="text-green-500 mx-auto" />
                <p className="font-semibold text-green-700">Absensi hari ini sudah lengkap</p>
                <p className="text-sm text-gray-600">Masuk <b>{jamWIB(absensi!.jam_checkin)}</b> · Pulang <b>{jamWIB(absensi!.jam_checkout)}</b></p>
              </div>
            ) : (
              <button onClick={() => setStep("checkin")}
                className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 flex items-center justify-center gap-2">
                <LogIn size={18} /> Check In
              </button>
            )}

            <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">Ganti karyawan</button>
          </div>
        )}

        {/* STEP 3a — CHECK IN */}
        {step === "checkin" && karyawan && (
          <CheckInView karyawan={karyawan} shiftName={shift?.nama_shift ?? null} setting={setting}
            onCancel={() => setStep("status")}
            onDone={async () => { await loadStatus(karyawan.id); setStep("status"); }} />
        )}

        {/* STEP 3b — CHECK OUT (menutup sesi open, boleh lintas tengah malam) */}
        {step === "checkout" && karyawan && openSession && (
          <CheckOutView absensiId={openSession.id} setting={setting}
            onCancel={() => setStep("status")}
            onDone={async () => { await loadStatus(karyawan.id); setStep("status"); }} />
        )}
      </div>
    </div>
  );
}

// ══════════════ CHECK IN (GPS + Foto wajib) ══════════════
function CheckInView({ karyawan, shiftName, setting, onCancel, onDone }: {
  karyawan: Karyawan; shiftName: string | null; setting: Setting | null;
  onCancel: () => void; onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [jarak, setJarak] = useState<number | null>(null);
  const [foto, setFoto] = useState<string | null>(null); // dataURL preview
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState("");
  const [gpsLoading, setGpsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // mulai kamera
  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      })
      .catch(() => setErr("Tidak bisa mengakses kamera. Izinkan akses kamera."));
    return () => { active = false; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ambil lokasi
  function ambilLokasi() {
    setGpsLoading(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setCoords({ lat, lng });
        if (setting) setJarak(hitungJarak(lat, lng, setting.latitude_dapur, setting.longitude_dapur));
        setGpsLoading(false);
      },
      () => { setErr("Tidak bisa mengambil lokasi. Izinkan akses lokasi (GPS)."); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  useEffect(() => { ambilLokasi(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function ambilFoto() {
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480; canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFoto(canvas.toDataURL("image/jpeg", 0.7));
    canvas.toBlob((b) => b && setFotoBlob(b), "image/jpeg", 0.7);
  }

  const diLuar = setting && jarak !== null && jarak > setting.radius_meter;
  const bisaCheckin = !!coords && !!fotoBlob && !diLuar && !!setting;

  async function submit() {
    if (!coords || !fotoBlob) return;
    setBusy(true); setErr("");
    try {
      const today = todayWIB();
      const path = `${karyawan.id}/${today}_${Date.now()}.jpg`;
      const up = await supabase.storage.from("foto-absensi").upload(path, fotoBlob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("Gagal upload foto: " + up.error.message);
      const fotoUrl = supabase.storage.from("foto-absensi").getPublicUrl(path).data.publicUrl;

      // shift hari ini (jika ada) + jam masuk (pakai custom lembur jika di-set)
      const { data: sa } = await supabase.from("shift_assignment")
        .select("shift_id, is_libur, jam_masuk_custom, shift_master:shift_id(jam_masuk)")
        .eq("karyawan_id", karyawan.id).eq("tanggal", today).maybeSingle();
      const saRow = sa as { shift_id: string | null; is_libur: boolean; jam_masuk_custom: string | null; shift_master: { jam_masuk: string } | null } | null;
      const adaShift = !!saRow && !saRow.is_libur && !!saRow.shift_id && !!saRow.shift_master;
      // Jam masuk resmi = custom (lembur depan) jika ada, kalau tidak jam normal
      const jamMasukResmi = saRow?.jam_masuk_custom || saRow?.shift_master?.jam_masuk || "";

      const checkinDate = new Date();
      const payload: Record<string, unknown> = {
        karyawan_id: karyawan.id, tanggal: today,
        shift_id: adaShift ? saRow!.shift_id : null,
        jam_checkin: checkinDate.toISOString(), foto_checkin_url: fotoUrl,
        lat_checkin: coords.lat, lng_checkin: coords.lng,
        status_kehadiran: "hadir",
      };

      // Hitung denda telat (hanya jika ada shift ter-assign)
      let telatKategori: string | null = null;
      let telatAmpun = false;
      if (adaShift) {
        const { start, end } = bulanRange(today);
        const { count } = await supabase.from("absensi")
          .select("id", { count: "exact", head: true })
          .eq("karyawan_id", karyawan.id).eq("kategori_telat", "K1").eq("denda_dihapus_ampun", true)
          .gte("tanggal", start).lte("tanggal", end);
        // Aturan telat yang berlaku pada TANGGAL CHECK-IN (tanggal kejadian)
        const rows = await muatAturan();
        const jalur = jalurDariKategori(karyawan.kategori_dokumen) ?? "training";
        const res = hitungDenda(jamMasukResmi, checkinDate, count ?? 0, cfgTelat(rows, jalur, today));
        payload.menit_telat         = res.menit_telat;
        payload.kategori_telat      = res.kategori_telat;
        payload.denda               = res.denda;
        payload.denda_dihapus_ampun = res.denda_dihapus_ampun;
        payload.is_flagged          = res.is_flagged;
        payload.flag_reason         = res.flag_reason;
        telatKategori = res.kategori_telat;
        telatAmpun = res.denda_dihapus_ampun;
      }

      const { error } = await supabase.from("absensi").upsert(payload, { onConflict: "karyawan_id,tanggal" });
      if (error) throw new Error(error.message);

      // Poin otomatis telat (K1 non-ampun 0.5, K2 1, K3 3)
      await poinTelat(karyawan.id, telatKategori, telatAmpun, today);

      streamRef.current?.getTracks().forEach((t) => t.stop());
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal check-in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">Check In · {karyawan.nama}</h2>
        <button onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCancel(); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      {/* GPS status */}
      <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${gpsLoading ? "bg-gray-50 border-gray-200 text-gray-500" : diLuar ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-700"}`}>
        <MapPin size={16} />
        {gpsLoading ? "Mengambil lokasi..." :
          !coords ? "Lokasi tidak tersedia" :
          !setting ? "Lokasi dapur belum diatur admin" :
          diLuar ? `Di luar area dapur (${Math.round(jarak!)} m). Check-in hanya di lokasi dapur.` :
          `Dalam area dapur (${Math.round(jarak!)} m) ✓`}
        {!gpsLoading && <button onClick={ambilLokasi} className="ml-auto text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>}
      </div>

      {/* Kamera / Foto */}
      <div className="rounded-xl overflow-hidden bg-gray-900 aspect-[3/4] relative">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="selfie" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}
      </div>

      {foto ? (
        <button onClick={() => { setFoto(null); setFotoBlob(null); }} className="w-full py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2">
          <Camera size={16} /> Ambil Ulang Foto
        </button>
      ) : (
        <button onClick={ambilFoto} className="w-full py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 flex items-center justify-center gap-2">
          <Camera size={16} /> Ambil Foto Selfie
        </button>
      )}

      {err && <p className="text-sm text-red-500">{err}</p>}

      <button onClick={submit} disabled={!bisaCheckin || busy}
        className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 disabled:opacity-40 flex items-center justify-center gap-2">
        <LogIn size={18} /> {busy ? "Memproses..." : "Check In Sekarang"}
      </button>
      {!foto && <p className="text-[11px] text-gray-400 text-center">Foto selfie wajib sebelum check-in</p>}
    </div>
  );
}

// ══════════════ CHECK OUT (GPS saja) ══════════════
function CheckOutView({ absensiId, setting, onCancel, onDone }: {
  absensiId: string; setting: Setting | null; onCancel: () => void; onDone: () => void;
}) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [jarak, setJarak] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [gpsLoading, setGpsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function ambilLokasi() {
    setGpsLoading(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setCoords({ lat, lng });
        if (setting) setJarak(hitungJarak(lat, lng, setting.latitude_dapur, setting.longitude_dapur));
        setGpsLoading(false);
      },
      () => { setErr("Tidak bisa mengambil lokasi. Izinkan akses lokasi (GPS)."); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  useEffect(() => { ambilLokasi(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const diLuar = setting && jarak !== null && jarak > setting.radius_meter;
  const bisa = !!coords && !diLuar && !!setting;

  async function submit() {
    if (!coords) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("absensi").update({
      jam_checkout: new Date().toISOString(), lat_checkout: coords.lat, lng_checkout: coords.lng,
    }).eq("id", absensiId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">Check Out</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${gpsLoading ? "bg-gray-50 border-gray-200 text-gray-500" : diLuar ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-700"}`}>
        <MapPin size={16} />
        {gpsLoading ? "Mengambil lokasi..." :
          !coords ? "Lokasi tidak tersedia" :
          !setting ? "Lokasi dapur belum diatur admin" :
          diLuar ? `Di luar area dapur (${Math.round(jarak!)} m). Check-out hanya di lokasi dapur.` :
          `Dalam area dapur (${Math.round(jarak!)} m) ✓`}
        {!gpsLoading && <button onClick={ambilLokasi} className="ml-auto text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>}
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <button onClick={submit} disabled={!bisa || busy}
        className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-40 flex items-center justify-center gap-2">
        <LogOut size={18} /> {busy ? "Memproses..." : "Check Out Sekarang"}
      </button>
    </div>
  );
}
