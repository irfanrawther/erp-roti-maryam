import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST /api/auth/login  { pin: "123456", role?: "spv" }
// Hash di server pakai Node.js crypto — works di HTTP maupun HTTPS.
// Jika `role` dikirim (dari tombol pilihan role di login), PIN hanya
// dicocokkan ke user dengan role tsb → tombol SPV tidak bisa login pakai PIN staff.
export async function POST(req: NextRequest) {
  try {
    const { pin, role } = await req.json() as { pin: string; role?: string };

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN wajib diisi" }, { status: 400 });
    }

    const pinHash = createHash("sha256").update(pin).digest("hex");

    let query = supabase
      .from("users")
      .select("id, nama, role, access_scope, aktif")
      .eq("pin_hash", pinHash);

    if (role && typeof role === "string") {
      query = query.eq("role", role);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "PIN salah" }, { status: 401 });
    }

    const user = rows[0];

    if (!user.aktif) {
      return NextResponse.json({ error: "Akun Anda sudah dinonaktifkan" }, { status: 403 });
    }

    return NextResponse.json({
      user: { id: user.id, nama: user.nama, role: user.role, access_scope: user.access_scope ?? null },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
