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

// Sama persis dengan ROOM_ACCESS di ChatWidget.tsx — siapa boleh lihat
// room mana, dipakai buat tahu siapa yang perlu dikirimi notifikasi.
const ROOM_ACCESS: Record<string, string[]> = {
  super_admin:              ["general", "produksi", "packing", "bahan_baku"],
  spv:                      ["general", "produksi", "packing", "bahan_baku"],
  staff_produksi:           ["general", "produksi"],
  staff_packing_pengiriman: ["general", "packing"],
  pic:                      ["general", "bahan_baku"],
};

// POST /api/send-push { roomId, message, senderId, senderName }
// Dipanggil dari ChatWidget setiap kali kirim pesan baru — kirim push ke
// semua user (selain pengirim) yang room-nya bisa akses room itu DAN
// sudah subscribe push notification.
export async function POST(req: NextRequest) {
  try {
    const { roomId, message, senderId, senderName } = await req.json() as {
      roomId: string; message: string; senderId: string; senderName: string;
    };
    if (!roomId || !message || !senderId) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }

    const rolesAllowed = Object.entries(ROOM_ACCESS)
      .filter(([, rooms]) => rooms.includes(roomId))
      .map(([role]) => role);
    if (rolesAllowed.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const { data: penerima } = await supabase.from("users")
      .select("id").in("role", rolesAllowed).neq("id", senderId);
    const penerimaIds = ((penerima as { id: string }[] | null) ?? []).map((u) => u.id);
    if (penerimaIds.length === 0) return NextResponse.json({ sent: 0 });

    const { data: subs } = await supabase.from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth").in("user_id", penerimaIds);
    const subRows = (subs as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[] | null) ?? [];

    const payload = JSON.stringify({
      title: `${senderName} — Chat`,
      body: message.length > 120 ? message.slice(0, 117) + "..." : message,
      url: "/dashboard",
      tag: `chat-${roomId}`,
    });

    let sent = 0;
    const matiIds: string[] = [];
    await Promise.all(subRows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e) {
        // Subscription kadaluarsa/dicabut browser (410/404) — bersihkan dari DB
        // supaya tidak dicoba terus tiap kali ada chat baru.
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) matiIds.push(s.id);
      }
    }));
    if (matiIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", matiIds);
    }

    return NextResponse.json({ sent, total: subRows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
