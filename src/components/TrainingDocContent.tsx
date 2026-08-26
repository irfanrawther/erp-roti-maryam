"use client";
// Rendering HTML terstruktur dari "PK & PP Masa Training — Karyawan Produksi".
// Isi & urutan pasal mengikuti PDF sumber apa adanya; field titik-titik
// dikonversi jadi input, digating per pihak (perusahaan vs karyawan).

export interface TrainingDocValues {
  tanggal_dokumen?: string;      // diisi Perusahaan (tanggal/bulan/tahun kontrak)
  diwakili_oleh?: string;        // Perusahaan
  jabatan_perwakilan?: string;   // Perusahaan
  jabatan_dilamar?: string;      // Karyawan (Pasal 1 Bagian A)
  nama_lengkap?: string;         // Karyawan
  nik?: string;                  // Karyawan
  ttl?: string;                  // Karyawan — tempat, tanggal lahir
  alamat?: string;               // Karyawan
  no_telepon?: string;           // Karyawan
  tanggal_mulai_kerja?: string;  // Karyawan (Pasal 12)
}

type Mode = "perusahaan" | "karyawan" | "readonly";
type Field = keyof TrainingDocValues;

const PERUSAHAAN_FIELDS: Field[] = ["tanggal_dokumen", "diwakili_oleh", "jabatan_perwakilan"];
const KARYAWAN_FIELDS: Field[] = ["jabatan_dilamar", "nama_lengkap", "nik", "ttl", "alamat", "no_telepon", "tanggal_mulai_kerja"];

function fieldEditable(field: Field, mode: Mode): boolean {
  if (mode === "readonly") return false;
  if (mode === "perusahaan") return PERUSAHAAN_FIELDS.includes(field);
  return KARYAWAN_FIELDS.includes(field);
}

function Blank({ field, values, mode, onChange, placeholder, type = "text", w = "w-full" }: {
  field: Field; values: TrainingDocValues; mode: Mode;
  onChange?: (field: Field, value: string) => void;
  placeholder?: string; type?: string; w?: string;
}) {
  const editable = fieldEditable(field, mode);
  const val = values[field] ?? "";
  if (!editable) {
    return (
      <span className={`inline-block border-b border-dotted border-gray-400 px-1 min-w-[80px] ${val ? "text-gray-800 font-medium" : "text-gray-300"}`}>
        {val || "…"}
      </span>
    );
  }
  return (
    <input
      type={type}
      value={val}
      onChange={(e) => onChange?.(field, e.target.value)}
      placeholder={placeholder ?? "…"}
      className={`inline-block ${w} border-b border-indigo-300 focus:border-indigo-500 outline-none px-1 text-indigo-700 font-medium bg-indigo-50/40 rounded-sm`}
    />
  );
}

function Pasal({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="font-bold text-gray-800 text-[13px]">Pasal {n} — {title}</p>
      <div className="text-[13px] text-gray-700 leading-relaxed space-y-1.5 mt-1">{children}</div>
    </div>
  );
}

export default function TrainingDocContent({ values, mode, onChange }: {
  values: TrainingDocValues; mode: Mode; onChange?: (field: Field, value: string) => void;
}) {
  const B = (field: Field, opts?: { placeholder?: string; type?: string; w?: string }) => (
    <Blank field={field} values={values} mode={mode} onChange={onChange} {...opts} />
  );

  return (
    <div className="text-sm leading-relaxed text-gray-800 space-y-4 max-w-none">
      <div className="text-center space-y-0.5 mb-4">
        <h2 className="font-bold text-base">PERJANJIAN KERJA DAN PERATURAN PERUSAHAAN</h2>
        <h2 className="font-bold text-base">MASA TRAINING — KARYAWAN PRODUKSI</h2>
        <p className="font-semibold text-gray-600">Cane RawtheR</p>
      </div>

      <p className="text-[13px]">
        Dokumen ini berlaku bagi seluruh karyawan baru divisi Produksi selama masa training/percobaan (90 hari kalender pertama).
        Setelah masa training berakhir dan karyawan dinyatakan lolos evaluasi, karyawan akan ditempatkan sebagai Staff dan
        menandatangani Perjanjian Kerja serta Peraturan Perusahaan Staff tersendiri. Promosi ke jenjang Supervisor (SPV) dapat
        dilakukan di kemudian hari melalui proses evaluasi dan perjanjian tersendiri, terpisah dari dokumen ini.
      </p>

      <p className="text-[13px]">
        Dokumen ini dibuat dan ditandatangani pada tanggal {B("tanggal_dokumen", { placeholder: "cth. 1 September 2026", w: "w-56" })}, di Jakarta Barat, oleh dan antara:
      </p>

      <div>
        <p className="font-bold text-[13px] mb-1">PIHAK PERTAMA (Perusahaan)</p>
        <table className="w-full text-[13px] border-collapse">
          <tbody>
            <tr><td className="py-0.5 pr-2 w-40 align-top text-gray-500">Nama Perusahaan</td><td className="py-0.5 align-top">: Cane RawtheR</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Alamat</td><td className="py-0.5 align-top">: Jalan Gajah Mada No. 91, Gajah Mada, Jakarta Barat</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Diwakili oleh</td><td className="py-0.5 align-top">: {B("diwakili_oleh", { w: "w-64" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Jabatan</td><td className="py-0.5 align-top">: {B("jabatan_perwakilan", { w: "w-64" })}</td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-bold text-[13px] mb-1">PIHAK KEDUA (Karyawan)</p>
        <table className="w-full text-[13px] border-collapse">
          <tbody>
            <tr><td className="py-0.5 pr-2 w-40 align-top text-gray-500">Nama Lengkap</td><td className="py-0.5 align-top">: {B("nama_lengkap", { w: "w-64" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">NIK / No. KTP</td><td className="py-0.5 align-top">: {B("nik", { w: "w-64" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Tempat, Tanggal Lahir</td><td className="py-0.5 align-top">: {B("ttl", { w: "w-64", placeholder: "cth. Jakarta, 1 Januari 2000" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Alamat</td><td className="py-0.5 align-top">: {B("alamat", { w: "w-64" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">No. Telepon</td><td className="py-0.5 align-top">: {B("no_telepon", { w: "w-64", type: "tel" })}</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-[13px]">Kedua pihak sepakat atas ketentuan berikut:</p>

      <h3 className="font-bold text-center text-red-700 text-[13px] mt-4">BAGIAN A — PERJANJIAN KERJA MASA TRAINING</h3>

      <Pasal n="1" title="Jabatan dan Penempatan">
        <p>1. PIHAK PERTAMA menerima PIHAK KEDUA untuk menjalani masa training pada jabatan: {B("jabatan_dilamar", { w: "w-48" })}, Divisi Produksi, berlokasi di Jalan Gajah Mada No. 91, Jakarta Barat.</p>
      </Pasal>

      <Pasal n="2" title="Masa Training dan Status Kerja">
        <p>1. PIHAK KEDUA menjalani masa training/percobaan selama 3 (tiga) bulan kalender (90 hari kalender) terhitung sejak tanggal mulai kerja.</p>
        <p>2. Selama masa training, PIHAK KEDUA berstatus karyawan percobaan dan tunduk pada seluruh ketentuan Peraturan Perusahaan pada Bagian B dokumen ini.</p>
        <p>3. Evaluasi kinerja dilakukan pada atau mendekati akhir masa training (hari kalender ke-90). PIHAK PERTAMA berhak mengakhiri hubungan kerja apabila PIHAK KEDUA tidak memenuhi standar kerja yang ditetapkan, dengan mengikuti ketentuan perundang-undangan yang berlaku.</p>
        <p>4. PIHAK KEDUA berhak mengajukan pengunduran diri (resign) kapan pun, termasuk selama masa training, dengan tunduk pada ketentuan pemberitahuan (notice period) 30 (tiga puluh) hari kalender dan Denda Pengunduran Diri Mendadak sebagaimana diatur dalam Pasal 9 Bagian B.</p>
      </Pasal>

      <Pasal n="3" title="Jam Kerja dan Shift">
        <p>1. Hari kerja adalah Senin sampai dengan Sabtu. Hari Minggu adalah hari libur.</p>
        <p>2. PIHAK KEDUA akan ditempatkan pada salah satu shift berikut sesuai jadwal yang ditetapkan:</p>
        <table className="w-full text-[12px] border border-gray-200 border-collapse my-1">
          <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1">Shift</th><th className="border border-gray-200 px-2 py-1">Jam Kerja</th><th className="border border-gray-200 px-2 py-1">Keterangan</th></tr></thead>
          <tbody>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Shift 1</td><td className="border border-gray-200 px-2 py-1 text-center">06.00–16.00 WIB</td><td className="border border-gray-200 px-2 py-1 text-center">Termasuk jam istirahat</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Shift 2</td><td className="border border-gray-200 px-2 py-1 text-center">08.00–18.00 WIB</td><td className="border border-gray-200 px-2 py-1 text-center">Termasuk jam istirahat</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Shift 3</td><td className="border border-gray-200 px-2 py-1 text-center">10.00–20.00 WIB</td><td className="border border-gray-200 px-2 py-1 text-center">Termasuk jam istirahat</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Shift 4</td><td className="border border-gray-200 px-2 py-1 text-center">13.00–23.00 WIB</td><td className="border border-gray-200 px-2 py-1 text-center">Termasuk jam istirahat</td></tr>
          </tbody>
        </table>
        <p>3. Jadwal shift ditentukan oleh PIHAK PERTAMA dan dapat berubah sesuai kebutuhan operasional.</p>
      </Pasal>

      <Pasal n="4" title="Upah Pokok Masa Training">
        <p>1. Selama masa training, PIHAK KEDUA menerima Upah Pokok sebesar Rp1.500.000 (satu juta lima ratus ribu rupiah) per bulan, dibayarkan penuh setiap periode penggajian (buka buku tanggal 1, tutup buku tanggal 30/31, dibayarkan tanggal 10 bulan berikutnya), diprorata sesuai hari kerja aktual untuk periode yang tidak genap satu bulan kalender.</p>
        <p>2. Upah Pokok merupakan hak yang wajib dibayarkan penuh atas hari kerja yang telah dilaksanakan, dalam kondisi apapun, termasuk dalam hal pengunduran diri mendadak.</p>
      </Pasal>

      <Pasal n="5" title="Bonus Penyelesaian Training">
        <p>1. Selain Upah Pokok, PIHAK KEDUA menerima Bonus Penyelesaian Training sebagai berikut:</p>
        <table className="w-full text-[12px] border border-gray-200 border-collapse my-1">
          <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1">Tahap</th><th className="border border-gray-200 px-2 py-1">Nominal</th><th className="border border-gray-200 px-2 py-1">Target Waktu</th></tr></thead>
          <tbody>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Tahap 1</td><td className="border border-gray-200 px-2 py-1 text-center">Rp500.000</td><td className="border border-gray-200 px-2 py-1 text-center">Hari kalender ke-30</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Tahap 2</td><td className="border border-gray-200 px-2 py-1 text-center">Rp600.000</td><td className="border border-gray-200 px-2 py-1 text-center">Hari kalender ke-60</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Tahap 3</td><td className="border border-gray-200 px-2 py-1 text-center">Rp600.000</td><td className="border border-gray-200 px-2 py-1 text-center">Hari kalender ke-90</td></tr>
          </tbody>
        </table>
        <p>2. Mekanisme dan ketentuan Bonus Penyelesaian Training:</p>
        <p>a. Target waktu pada ayat 1 tertunda (mundur) apabila terdapat hari di mana PIHAK KEDUA tidak hadir bekerja, dengan alasan apapun termasuk izin, sakit, cuti, maupun tanpa keterangan. Setiap 1 (satu) hari ketidakhadiran menunda target waktu tahap yang bersangkutan dan tahap-tahap berikutnya selama 1 (satu) hari kalender.</p>
        <p>b. Bonus dibayarkan secara otomatis pada hari kerja berikutnya setelah target waktu (sebagaimana telah disesuaikan menurut huruf a, apabila ada) tercapai, secara terpisah dari siklus penggajian bulanan. Apabila target waktu bertepatan dengan hari Minggu, pembayaran dilakukan pada hari kerja berikutnya.</p>
        <p>c. Apabila PIHAK KEDUA mengundurkan diri atau hubungan kerja berakhir sebelum target waktu suatu tahap tercapai, maka tahap yang bersangkutan dan tahap-tahap berikutnya tidak menjadi hak PIHAK KEDUA, KECUALI apabila Pemutusan Hubungan Kerja dilakukan oleh PIHAK PERTAMA karena sebab selain pelanggaran berat (termasuk hasil evaluasi kinerja), dalam hal mana tahap yang target waktunya sudah tercapai atau akan tercapai dalam 14 (empat belas) hari kalender sejak tanggal Pemutusan Hubungan Kerja, tetap dibayarkan penuh.</p>
        <p>d. Keterlambatan sebagaimana diatur dalam Pasal 2 Bagian B turut mengurangi nominal Bonus Penyelesaian Training pada tahap terdekat yang belum jatuh tempo pada saat pelanggaran terjadi, dengan rincian: Kategori 1 (1–15 menit) mengurangi Rp10.000; Kategori 2 (16–45 menit) mengurangi Rp20.000; Kategori 3 (lebih dari 45 menit) mengurangi Rp30.000. Apabila potongan melebihi nominal tahap terdekat yang belum jatuh tempo, kekurangan potongan dilanjutkan ke tahap berikutnya.</p>
        <p>3. Ketentuan mengenai syarat dan mekanisme pencairan Bonus Penyelesaian Training sama sekali tidak mengurangi kewajiban PIHAK PERTAMA untuk membayar penuh Upah Pokok sebagaimana Pasal 4.</p>
      </Pasal>

      <Pasal n="6" title="Pengakhiran Hubungan Kerja Selama Masa Training">
        <p>1. Hubungan kerja dapat berakhir karena: hasil evaluasi training tidak memenuhi standar, pengunduran diri (resign), pemutusan hubungan kerja (PHK) oleh PIHAK PERTAMA, atau force majeure.</p>
        <p>2. PIHAK KEDUA yang ingin mengundurkan diri wajib memberikan pemberitahuan tertulis (surat resign fisik, bertanggal, diserahkan langsung) minimum 30 (tiga puluh) hari kalender sebelum tanggal efektif resign, berlaku sejak hari pertama kerja.</p>
        <p>3. Upah atas hari kerja yang telah dilaksanakan tetap wajib dibayarkan penuh dalam kondisi apapun. Pengunduran diri (resign) tidak memberikan hak atas uang pesangon atau uang jasa kepada PIHAK KEDUA.</p>
        <p>4. Apabila PIHAK KEDUA mengundurkan diri dengan pemberitahuan kurang dari 30 (tiga puluh) hari kalender, PIHAK KEDUA dikenakan Denda Pengunduran Diri Mendadak sesuai formula dan mekanisme yang diatur dalam Pasal 9 Bagian B dan Lampiran Perhitungan Denda Pengunduran Diri Mendadak.</p>
        <p>5. PIHAK PERTAMA berhak melakukan PHK apabila PIHAK KEDUA melakukan pelanggaran sebagaimana diatur dalam sistem poin dan Surat Peringatan pada Bagian B, dengan mengikuti prosedur yang berlaku.</p>
      </Pasal>

      <Pasal n="7" title="Dokumen Terkait">
        <p>Dokumen ini dibaca bersama dengan: Lampiran Perhitungan Denda Pengunduran Diri Mendadak, SOP Produksi Cane RawtheR, dan Peraturan Sistem Reject Produksi, yang merupakan satu kesatuan tidak terpisahkan.</p>
      </Pasal>

      <h3 className="font-bold text-center text-red-700 text-[13px] mt-4">BAGIAN B — PERATURAN PERUSAHAAN (BERLAKU SELAMA MASA TRAINING)</h3>
      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 1 — JAM KERJA DAN KEHADIRAN</p>

      <Pasal n="1" title="Jam Kerja">
        <p>Hari kerja adalah Senin sampai Sabtu. Karyawan bekerja sesuai shift yang ditetapkan oleh perusahaan (Shift 1: 06.00–16.00, Shift 2: 08.00–18.00, Shift 3: 10.00–20.00, Shift 4: 13.00–23.00). Jadwal shift dapat berubah sesuai kebutuhan operasional.</p>
      </Pasal>

      <Pasal n="2" title="Keterlambatan">
        <p>Karyawan wajib hadir tepat waktu sesuai shift. Keterlambatan dikenakan poin sebagai berikut:</p>
        <table className="w-full text-[12px] border border-gray-200 border-collapse my-1">
          <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1">Kategori</th><th className="border border-gray-200 px-2 py-1">Durasi Keterlambatan</th><th className="border border-gray-200 px-2 py-1">Poin</th></tr></thead>
          <tbody>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Kategori 1</td><td className="border border-gray-200 px-2 py-1 text-center">1–15 menit</td><td className="border border-gray-200 px-2 py-1 text-center">0,5 poin</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Kategori 2</td><td className="border border-gray-200 px-2 py-1 text-center">16–45 menit</td><td className="border border-gray-200 px-2 py-1 text-center">1 poin</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">Kategori 3</td><td className="border border-gray-200 px-2 py-1 text-center">Lebih dari 45 menit</td><td className="border border-gray-200 px-2 py-1 text-center">3 poin</td></tr>
          </tbody>
        </table>
        <p>Dispensasi: Keterlambatan Kategori 1 hingga 3 (tiga) kali dalam satu bulan dianggap 0 poin. Poin keterlambatan turut menjadi dasar perhitungan pada dokumen Perjanjian Kerja yang berlaku bagi karyawan bersangkutan.</p>
      </Pasal>

      <Pasal n="3" title="Izin Tidak Hadir">
        <p className="font-semibold">a. Izin (bukan sakit):</p>
        <p>Shift 1 wajib memberi kabar 1 jam sebelum shift dimulai, Shift 2 & 3: 2 jam sebelum, Shift 4: 5 jam sebelum.</p>
        <p>• Memberi kabar sesuai deadline: Denda Rp50.000<br />• Memberi kabar terlambat namun sebelum shift dimulai: Denda Rp75.000 + 2 poin<br />• Memberi kabar setelah shift dimulai: Denda Rp150.000 + 3 poin<br />• Tidak memberi kabar sama sekali (alpha/mangkir): 10 poin pelanggaran (setara status SP2)</p>
        <p className="font-semibold">b. Izin Sakit:</p>
        <p>Shift 1 wajib memberi kabar 1 jam sebelum shift dimulai, Shift 2 & 3: 2 jam sebelum, Shift 4: 5 jam sebelum.</p>
        <p>• Izin sakit pertama dalam bulan berjalan, memberi kabar tepat waktu dan mengirim surat dokter sebelum jam 20.00: tidak ada denda atau poin<br />• Izin sakit pertama, memberi kabar terlambat namun sebelum shift dimulai: Denda Rp25.000 + 0.5 poin<br />• Izin sakit pertama, memberi kabar setelah shift dimulai: Denda Rp50.000 + 1 poin<br />• Izin sakit kedua dan seterusnya dalam bulan berjalan: denda mengikuti tabel sakit pertama sesuai waktu pemberian kabar<br />• Tidak menunjukkan surat dokter sesuai ketentuan: dianggap izin biasa dan denda mengikuti huruf a</p>
        <p className="font-semibold">c. Ketentuan tambahan:</p>
        <p>• Dalam 1 hari kerja yang sama, maksimal 1 orang karyawan mengambil izin (bukan sakit) per hari. Karyawan berikutnya yang ingin izin biasa wajib masuk atau dikenakan denda sesuai huruf a + tambahan denda Rp100.000<br />• Ketentuan kuota tidak berlaku untuk izin sakit dengan surat dokter yang sah<br />• Lebih dari 2 kali sakit dalam satu bulan: dikenakan denda di atas dan dicatat untuk evaluasi kinerja</p>
      </Pasal>

      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 2 — SISTEM POIN DAN SURAT PERINGATAN</p>

      <Pasal n="4" title="Sistem Poin">
        <p>Pelanggaran peraturan perusahaan diukur menggunakan sistem poin yang berlaku secara akumulatif dalam periode kuartal kalender (Januari–Maret, April–Juni, Juli–September, Oktober–Desember). Poin direset ke 0 pada awal setiap kuartal baru.</p>
        <table className="w-full text-[11px] border border-gray-200 border-collapse my-1">
          <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-1.5 py-1">No.</th><th className="border border-gray-200 px-1.5 py-1 text-left">Pelanggaran</th><th className="border border-gray-200 px-1.5 py-1">Poin</th><th className="border border-gray-200 px-1.5 py-1">Tier</th></tr></thead>
          <tbody>
            {[
              [1, "Peralatan tidak dikembalikan ke tempat yang ditentukan", "0,5", "Tier 1"],
              [2, "Pasang musik di area kerja saat jam kerja aktif", "0,5", "Tier 1"],
              [3, "Penggunaan HP untuk keperluan pribadi di area produksi saat jam kerja aktif", "0,5", "Tier 1"],
              [4, "Seragam/atribut/shower cap tidak lengkap saat masuk shift", "0,5", "Tier 1"],
              [5, "Tidak melaporkan hasil produksi/reject ke grup tepat waktu", "0,5", "Tier 1"],
              [6, "Terlambat Kategori 1 (1–15 menit)", "0,5", "Tier 1"],
              [7, "Area kerja tidak dibersihkan sebelum/sesudah shift", "1", "Tier 1"],
              [8, "Membersihkan area/peralatan tidak sesuai ketentuan", "1", "Tier 1"],
              [9, "Tidak cuci tangan sebelum bekerja atau setelah dari toilet", "1", "Tier 1"],
              [10, "Kuku panjang atau memakai hiasan kuku di area produksi", "1", "Tier 1"],
              [11, "Terlambat Kategori 2 (16–45 menit)", "1", "Tier 1"],
              [12, "Memakai aksesoris (gelang, jam tangan, cincin, dll) di area produksi", "1", "Tier 1"],
              [13, "Makan atau minum di area produksi aktif", "2", "Tier 2"],
              [14, "Berbicara kasar atau tidak sopan kepada rekan kerja atau SPV", "2", "Tier 2"],
              [15, "Jobdesk tidak dikerjakan", "2", "Tier 2"],
              [16, "Tidak patuh instruksi SPV setelah teguran lisan pertama", "2", "Tier 2"],
              [17, "Tidur di area produksi saat jam kerja aktif (pelanggaran pertama)", "3", "Tier 2"],
              [18, "Adonan basi akibat kelalaian (dibagi rata ke shift, dibulatkan 0,5/orang)", "0,5*", "Tier 2"],
              [19, "Meninggalkan area produksi tanpa izin SPV saat jam kerja aktif", "3", "Tier 2"],
              [20, "Merokok di area produksi atau area yang tidak diizinkan", "3", "Tier 2"],
              [21, "Mengoperasikan mesin di luar jobdesk tanpa izin SPV", "3", "Tier 2"],
              [22, "Terlambat Kategori 3 (lebih dari 45 menit)", "3", "Tier 2"],
              [23, "Membocorkan informasi rahasia perusahaan kepada pihak luar", "5", "Tier 3"],
              [24, "Berulang kali tidak patuh instruksi SPV setelah teguran tertulis", "5", "Tier 3"],
              [25, "Merusak peralatan/mesin akibat kelalaian yang dapat dibuktikan", "5", "Tier 3"],
              [26, "Membawa orang luar ke area produksi tanpa izin", "5", "Tier 3"],
              [27, "Intimidasi verbal secara sengaja kepada rekan/atasan", "5", "Tier 3"],
              [28, "Tidak hadir tanpa memberi kabar sama sekali (alpha/mangkir)", "10", "Tier 3"],
            ].map((r) => (
              <tr key={r[0] as number}>
                <td className="border border-gray-200 px-1.5 py-1 text-center">{r[0]}</td>
                <td className="border border-gray-200 px-1.5 py-1">{r[1]}</td>
                <td className="border border-gray-200 px-1.5 py-1 text-center">{r[2]}</td>
                <td className="border border-gray-200 px-1.5 py-1 text-center">{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[12px] italic">Catatan: Pelanggaran Tier 4 mengakibatkan PHK langsung tanpa melalui sistem poin dan SP (dengan tetap tunduk pada prosedur hukum yang berlaku). Yang termasuk Tier 4: datang dalam kondisi mabuk/terpengaruh narkoba, memalsukan absensi karyawan lain, pencurian signifikan, kekerasan fisik, sabotase produksi secara sengaja, pemalsuan data produksi secara sengaja.</p>
      </Pasal>

      <Pasal n="5" title="Threshold Surat Peringatan">
        <table className="w-full text-[12px] border border-gray-200 border-collapse my-1">
          <thead><tr className="bg-gray-50"><th className="border border-gray-200 px-2 py-1">Level</th><th className="border border-gray-200 px-2 py-1">Akumulasi Poin</th><th className="border border-gray-200 px-2 py-1 text-left">Konsekuensi</th></tr></thead>
          <tbody>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">SP1</td><td className="border border-gray-200 px-2 py-1 text-center">5 poin</td><td className="border border-gray-200 px-2 py-1">Surat Peringatan tertulis, dicatat dalam file karyawan</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">SP2</td><td className="border border-gray-200 px-2 py-1 text-center">10 poin</td><td className="border border-gray-200 px-2 py-1">Surat Peringatan tertulis; dicatat sebagai bagian dari evaluasi kinerja akhir masa training (Pasal 2 ayat 3 Bagian A)</td></tr>
            <tr><td className="border border-gray-200 px-2 py-1 text-center">SP3 / PHK</td><td className="border border-gray-200 px-2 py-1 text-center">15 poin</td><td className="border border-gray-200 px-2 py-1">Pemutusan Hubungan Kerja tanpa pesangon, dengan mengikuti prosedur yang berlaku</td></tr>
          </tbody>
        </table>
        <p>Poin direset ke 0 pada awal setiap kuartal kalender. SP tidak ikut direset, SP yang sudah diterbitkan tetap tercatat dalam file karyawan. Status "SP2 aktif" adalah SP2 yang diterbitkan akibat akumulasi poin pada kuartal kalender yang sedang berjalan; SP dari kuartal sebelumnya tidak kembali menghanguskan tunjangan pada kuartal berjalan, kecuali terjadi akumulasi poin baru yang kembali mencapai ambang SP2.</p>
        <p>SP dapat ditutup secara aktif apabila karyawan tidak memiliki pelanggaran selama 2 kuartal berturut-turut setelah SP diterbitkan, dengan persetujuan Manajer Operasional. SP yang ditutup tidak dihitung untuk eskalasi namun tetap tercatat di file karyawan.</p>
        <p>Pemutusan Hubungan Kerja pada ambang SP3 dilaksanakan dengan mengikuti seluruh prosedur dan ketentuan perundang-undangan ketenagakerjaan yang berlaku, termasuk untuk kasus yang melibatkan ketidakhadiran tanpa keterangan.</p>
      </Pasal>

      <Pasal n="6" title="Alur Pencatatan Poin">
        <p>1. SPV mencatat pelanggaran menggunakan form standar yang disediakan perusahaan, mencakup: nama karyawan, jenis pelanggaran, tanggal dan jam kejadian, serta saksi apabila ada.</p>
        <p>2. Catatan pelanggaran dilaporkan kepada Manajer Operasional melalui WhatsApp maksimum 24 jam setelah kejadian.</p>
        <p>3. Manajer Operasional yang memeriksa dan menetapkan poin secara resmi.</p>
        <p>4. Karyawan yang bersangkutan diberitahu secara tertulis dalam 2x24 jam setelah kejadian dan diberi kesempatan klarifikasi.</p>
        <p>5. Keputusan final ada di tangan Manajer Operasional setelah mendengar klarifikasi karyawan.</p>
      </Pasal>

      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 3 — HIGIENITAS DAN TATA TERTIB AREA PRODUKSI</p>

      <Pasal n="7" title="Higienitas, Kebersihan, dan Tata Tertib">
        <p>• Standar higienitas mengikuti SOP Produksi. Pelanggaran dikenakan poin sesuai tabel pelanggaran Pasal 4.</p>
        <p>• Kewajiban kebersihan area kerja mengikuti SOP Produksi.</p>
        <p>• HP boleh dibawa untuk komunikasi kerja. Penggunaan pribadi hanya saat istirahat di luar area produksi aktif.</p>
        <p>Selama masa training, pelanggaran kebersihan dikenakan poin sesuai tabel pelanggaran Pasal 4 tanpa ketentuan khusus tambahan, karena kompensasi masa training tidak memiliki komponen Tunjangan Kebersihan sebagaimana berlaku pasca-training.</p>
      </Pasal>

      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 4 — SISTEM REJECT PRODUKSI</p>

      <Pasal n="8" title="Pengelolaan Reject">
        <p>Sistem pengelolaan reject produksi diatur dalam dokumen Peraturan Sistem Reject Produksi yang merupakan lampiran tidak terpisahkan dari peraturan ini. Sanksi poin atas kelalaian yang berkaitan dengan reject tetap mengacu pada tabel pelanggaran Pasal 4.</p>
      </Pasal>

      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 5 — PENGUNDURAN DIRI (RESIGN) DAN DENDA PENGUNDURAN DIRI MENDADAK</p>

      <Pasal n="9" title="Ketentuan Resign dan Denda Pengunduran Diri Mendadak">
        <p>1. Karyawan berhak mengajukan pengunduran diri (resign) kapan pun selama masa training, dengan memberikan surat pemberitahuan tertulis fisik bertanggal minimum 30 (tiga puluh) hari kalender sebelum tanggal efektif resign.</p>
        <p>2. Upah atas hari kerja yang telah dilaksanakan wajib dibayar penuh dalam segala kondisi. Karyawan yang resign tidak berhak atas uang pesangon atau uang jasa.</p>
        <p>3. Apabila karyawan mengundurkan diri dengan pemberitahuan kurang dari 30 hari kalender, dikenakan Denda Pengunduran Diri Mendadak Tier 1 sebagaimana diatur dalam Lampiran Perhitungan Denda Pengunduran Diri Mendadak, dikurangi nilai Bonus Penyelesaian Training yang hangus akibat resign tersebut (agar tidak terjadi penagihan ganda).</p>
        <p>4. Seluruh potongan atas upah karyawan dalam 1 (satu) periode penggajian termasuk Denda Pengunduran Diri Mendadak, kasbon, dan potongan lain apabila ada, digabung dan sesuai yang diatur oleh ketentuan perundang-undangan yang berlaku. Kekurangan yang belum tertutup menjadi utang piutang antara perusahaan dan karyawan yang bersangkutan.</p>
        <p>5. Kerugian tidak langsung berupa kehilangan pesanan, penjualan, atau peluang bisnis TIDAK termasuk dalam perhitungan Denda Pengunduran Diri Mendadak.</p>
        <p>6. Kerusakan peralatan atau aset perusahaan akibat kelalaian yang dapat dibuktikan, di luar keausan wajar pemakaian, dikenakan kewajiban ganti rugi sebesar nilai kerusakan yang terjadi, yang diperhitungkan bersama-sama dengan potongan lain sebagaimana diatur dalam ayat 4.</p>
      </Pasal>

      <Pasal n="10" title="Ketentuan Kasbon">
        <p>1. Kasbon dengan nominal hingga 10% (sepuluh persen) dari Upah Pokok (Rp150.000) dapat diberikan berdasarkan permintaan yang dicatat oleh PIHAK PERTAMA, tanpa memerlukan form persetujuan tertulis formal sebagaimana ayat 2.</p>
        <p>2. Kasbon dengan nominal lebih dari Rp150.000 wajib menggunakan persetujuan tertulis dari karyawan yang mencantumkan nominal, tanggal pengambilan, dan rencana tanggal pemotongan.</p>
        <p>3. Kasbon dipotong pada periode penggajian terdekat setelah tanggal pengambilan, digabung apabila terdapat lebih dari satu kasbon dalam periode yang sama.</p>
      </Pasal>

      <p className="font-bold text-[12px] text-gray-500 text-center">BAB 6 — KETENTUAN PENUTUP</p>

      <Pasal n="11" title="Perubahan">
        <p>Peraturan Perusahaan berhak sepenuhnya untuk mengubah, menambah, dan/atau mencabut sebagian maupun keseluruhan ketentuan yang diatur dalam Peraturan Perusahaan ini, sesuai dengan kebijakan dan kebutuhan operasional perusahaan yang berlaku dari waktu ke waktu.</p>
      </Pasal>

      <Pasal n="12" title="Tanda Tangan">
        <p>Dengan menandatangani dokumen ini, karyawan menyatakan telah membaca, memahami, dan menyetujui seluruh ketentuan yang tercantum dalam dokumen ini.</p>
        <table className="w-full text-[13px] border-collapse mt-1">
          <tbody>
            <tr><td className="py-0.5 pr-2 w-40 align-top text-gray-500">Nama Karyawan</td><td className="py-0.5 align-top">: {B("nama_lengkap", { w: "w-64" })}</td></tr>
            <tr><td className="py-0.5 pr-2 align-top text-gray-500">Tanggal Mulai Kerja</td><td className="py-0.5 align-top">: {B("tanggal_mulai_kerja", { type: "date", w: "w-48" })}</td></tr>
          </tbody>
        </table>
      </Pasal>
    </div>
  );
}
