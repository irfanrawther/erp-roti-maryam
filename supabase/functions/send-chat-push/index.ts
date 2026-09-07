import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Ambil semua subscription kecuali milik si pengirim
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .neq("user_id", record.user_id);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const roomLabels: Record<string, string> = {
      general: "General",
      produksi: "Produksi",
      packing: "Packing",
      bahan_baku: "Bahan Baku",
    };

    const notifPayload = JSON.stringify({
      title: `Chat baru - ${roomLabels[record.room_id] ?? record.room_id}`,
      body: record.message.length > 80 ? record.message.slice(0, 80) + "..." : record.message,
      url: "/",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notifPayload
        );
        sent++;
      } catch (err) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});