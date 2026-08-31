-- ============================================================
-- 068_retensi_foto_pelanggaran.sql
-- Fungsi pembersih foto bukti pelanggaran > 90 hari, KECUALI yang
-- jadi bukti laporan yang pernah menyumbang poin ke karyawan yang
-- SAAT INI punya status SP aktif (SP tidak pernah hilang — Pasal 5
-- — jadi foto pendukungnya juga tidak boleh hilang).
--
-- PENTING: migrasi ini HANYA membuat fungsinya. Menjadwalkannya
-- (harian/mingguan) HARUS dilakukan manual lewat Supabase Dashboard
-- — saya tidak punya akses untuk itu dari sini. Lihat instruksi di
-- bagian bawah file ini.
--
-- Definisi "bukti resmi SP" di fungsi ini: laporan_pelanggaran yang
-- pernah insert baris ke poin_karyawan (artinya sudah diputuskan
-- Manajer Operasional, bukan sekadar laporan pending/ditolak) DAN
-- karyawan ybs saat ini punya status_sp_karyawan aktif. Ini sengaja
-- longgar (melindungi lebih banyak, bukan lebih sedikit) karena tidak
-- ada relasi presisi "poin K yang mana yang memicu SP level berapa".
-- Kalau definisi ini tidak sesuai maksud Anda, beri tahu saya dulu
-- sebelum dijadwalkan berjalan.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bersihkan_foto_pelanggaran_lama()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dihapus_pelanggaran integer := 0;
  v_dihapus_insiden     integer := 0;
  r RECORD;
BEGIN
  -- laporan_pelanggaran: kosongkan foto_bukti_urls yang > 90 hari &
  -- TIDAK terhubung ke karyawan dengan SP aktif.
  FOR r IN
    SELECT lp.id
    FROM public.laporan_pelanggaran lp
    WHERE lp.foto_bukti_urls IS NOT NULL
      AND lp.created_at < now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.poin_karyawan pk
        JOIN public.status_sp_karyawan sp
          ON sp.karyawan_id = pk.karyawan_id AND sp.is_aktif = true
        WHERE pk.laporan_id = lp.id
      )
  LOOP
    UPDATE public.laporan_pelanggaran SET foto_bukti_urls = NULL WHERE id = r.id;
    v_dihapus_pelanggaran := v_dihapus_pelanggaran + 1;
  END LOOP;

  -- laporan_insiden_berat: insiden Tier 4 selalu berujung tindakan
  -- manajemen permanen (PHK) — foto TIDAK pernah dihapus otomatis.
  -- (Tidak ada penghapusan di sini, sengaja.)

  RETURN jsonb_build_object(
    'ok', true,
    'laporan_pelanggaran_dibersihkan', v_dihapus_pelanggaran,
    'dijalankan_pada', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bersihkan_foto_pelanggaran_lama TO authenticated, anon;

-- Catatan: fungsi ini HANYA mengosongkan kolom foto_bukti_urls di
-- database. File aslinya di Supabase Storage (bucket foto-absensi,
-- folder pelanggaran/) TIDAK ikut terhapus oleh fungsi SQL ini —
-- penghapusan file Storage perlu dilakukan lewat Edge Function
-- terpisah (butuh service role key, tidak bisa lewat SQL biasa).
-- Kalau retensi Storage-nya juga wajib (bukan cuma referensinya),
-- beri tahu saya — itu perlu Edge Function tambahan yang tidak bisa
-- saya deploy dari sesi ini.

-- ============================================================
-- CARA MENJADWALKAN (manual, lewat Supabase Dashboard):
--   1. Buka project di supabase.com/dashboard
--   2. Database → Cron Jobs → "Create a new cron job"
--   3. Nama: "Bersihkan foto pelanggaran lama"
--   4. Schedule: 0 3 * * *   (tiap hari jam 03:00)
--   5. SQL command: SELECT public.bersihkan_foto_pelanggaran_lama();
-- ============================================================

SELECT 'fungsi bersihkan_foto_pelanggaran_lama dibuat — jadwalkan manual via Dashboard' AS info;
