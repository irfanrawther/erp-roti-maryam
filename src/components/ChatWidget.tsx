"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { MessageCircle, X, Send } from "lucide-react";

interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  users?: { nama: string };
}

const ALL_ROOMS = [
  { id: "general", label: "General" },
  { id: "produksi", label: "Produksi" },
  { id: "packing", label: "Packing" },
  { id: "bahan_baku", label: "Bahan Baku" },
];

// Role → room yang boleh diakses
const ROOM_ACCESS: Record<string, string[]> = {
  super_admin:              ["general", "produksi", "packing", "bahan_baku"],
  spv:                      ["general", "produksi", "packing", "bahan_baku"],
  staff_produksi:           ["general", "produksi"],
  staff_packing_pengiriman: ["general", "packing"],
  pic:                      ["general", "bahan_baku"],
};

export default function ChatWidget() {
  const user = getUserSession();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (user) subscribeToPush(user.id);
  }, [user?.id]);
  const [activeRoom, setActiveRoom] = useState<string>("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  const allowedRoomIds = ROOM_ACCESS[user.role] ?? ["general"];
  const availableRooms = ALL_ROOMS.filter((r) => allowedRoomIds.includes(r.id));

  useEffect(() => {
    if (!allowedRoomIds.includes(activeRoom)) {
      setActiveRoom(availableRooms[0]?.id ?? "general");
    }
  }, [user.role]);

  useEffect(() => {
    fetchMessages(activeRoom);
    const ch = supabase.channel(`chat-msg-${activeRoom}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoom}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeRoom]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function fetchMessages(roomId: string) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, room_id, user_id, message, created_at, users:user_id(nama)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as unknown as ChatMessage[]) ?? []);
  }

  async function sendMessage() {
    if (!input.trim() || !user) return;
    if (!allowedRoomIds.includes(activeRoom)) return; // safety check
    setSending(true);
    await supabase.from("chat_messages").insert({
      room_id: activeRoom,
      user_id: user.id,
      message: input.trim(),
    });
    setInput("");
    setSending(false);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-yellow-400 hover:bg-yellow-500 shadow-lg flex items-center justify-center transition-colors"
        >
          <MessageCircle size={24} className="text-gray-800" />
        </button>
      ) : (
        <div className="w-80 sm:w-96 h-[26rem] bg-white rounded-2xl shadow-2xl border border-yellow-300 flex flex-col overflow-hidden">
          <div className="bg-yellow-400 px-3 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} className="text-gray-800" />
              <span className="font-bold text-sm text-gray-800">Chat Produksi</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-700 hover:text-gray-900">
              <X size={18} />
            </button>
          </div>

          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <select
              value={activeRoom}
              onChange={(e) => setActiveRoom(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
            >
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-gray-50">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-gray-400 mt-8">Belum ada chat di room ini</p>
            ) : (
              messages.map((m) => {
                const isMe = m.user_id === user.id;
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs ${isMe ? "bg-yellow-400 text-gray-800" : "bg-white border border-gray-200 text-gray-700"}`}>
                      {!isMe && <p className="font-semibold text-[10px] text-gray-500 mb-0.5">{m.users?.nama ?? "User"}</p>}
                      <p>{m.message}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5">{formatTime(m.created_at)}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2 border-t border-gray-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
              placeholder="Ketik pesan..."
              className="flex-1 text-xs border border-gray-200 rounded-full px-3 py-2 focus:outline-none focus:border-yellow-400"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-8 h-8 rounded-full bg-yellow-400 hover:bg-yellow-500 disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              <Send size={14} className="text-gray-800" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush(userId: string) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
    });
  } catch (err) {
    console.error("Push subscribe error:", err);
  }
}