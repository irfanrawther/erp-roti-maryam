import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { senderUserId, roomLabel, message } = await req.json();

    // Ambil semua subscription KECUALI milik si pengirim
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .neq("user_id", senderUserId);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title: `Chat baru - ${roomLabel}`,
      body: message.length > 80 ? message.slice(0, 80) + "..." : message,
      url: "/",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err) {
        // Subscription expired/invalid, hapus dari DB
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }

    return NextResponse.json({ sent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}