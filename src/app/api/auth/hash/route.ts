import { NextRequest, NextResponse } from "next/server";

// Route debug sementara — hapus setelah masalah selesai
// GET /api/auth/hash?pin=111111
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get("pin");
  if (!pin) return NextResponse.json({ error: "pin param required" }, { status: 400 });

  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return NextResponse.json({ pin, hash });
}
