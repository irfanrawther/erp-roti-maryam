import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Log sementara buat debug subscribeToPush() gagal di device tertentu —
// lihat komentar di migration 077_push_debug_log.sql.
export async function POST(req: NextRequest) {
  try {
    const { userId, step, detail, userAgent } = await req.json() as {
      userId: string; step: string; detail: string; userAgent: string;
    };
    await supabase.from("push_debug_log").insert({ user_id: userId ?? null, step, detail, user_agent: userAgent });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
