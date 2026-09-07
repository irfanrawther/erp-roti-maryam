"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSession } from "@/lib/auth";
import { MessageCircle, X, Send } from "lucide-react";

interface ChatMessage {
  id: string;
  batch_produksi_id: string;
  user_id: string;
  message: string;
  created_at: string;
  users?: { nama: string };
}

interface BatchOption {
  id: string;
  label: string; // "Cane RawtheR - Original (Adonan)"
}

export default function ChatWidget() {
  const user = getUserSession();
  const [open, setOpen] = useState(true); // default EXPAND
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Jangan render kalau belum login
  if (!user) return null;

  // ── Fetch batch aktif untuk dropdown ──
  useEffect(() => {
    fetchActiveBatches();
    const ch = supabase.channel("chat-batches-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "batch_produksi" }, fetchActiveBatches)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchActiveBatches() {
    const { data } = await supabase
      .from("batch_produksi")
      .select("id, tanggal_produksi, status, produk_sku:produk_sku_id(nama_brand, varian)")
      .neq("status", "selesai")
      .order("created_at", { ascending: false })
      .limit(30);

    const stageLabel: Record<string, string> = {
      adonan: "Adonan", bikin: "Rendam", packing: "Packing & Freezer", freezer: "Packing & Freezer",
    };

    const list: BatchOption[] = ((data as unknown as { id: string; status: string; produk_sku: { nama_brand: string; varian: string } }[]) ?? []).map((b) => ({
      id: b.id,
      label: `${b.produk_sku?.nama_brand ?? ""} — ${b.produk_sku?.varian ?? ""} (${stageLabel[b.status] ?? b.status})`,
    }));
    setBatches(list);
    if (!activeBatchId && list.length > 0) setActiveBatchId(list[0].id);
  }

  // ── Fetch messages untuk batch aktif ──
  useEffect(() => {
    if (!activeBatchId) { setMessages([]); return; }
    fetchMessages(activeBatchId);
    const ch = supabase.channel(`chat-msg-${activeBatchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `batch_produksi_id=eq.${activeBatchId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeBatchId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function fetchMessages(batchId: string) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, batch_produksi_id, user_id, message, created_at, users:user_id(nama)")
      .eq("batch_produksi_id", batchId)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as unknown as ChatMessage[]) ?? []);
  }

  async function sendMessage() {
    if (!input.trim() || !activeBatchId || !user) return;
    setSending(true);
    await supabase.from("chat_messages").insert({
      batch_produksi_id: activeBatchId,
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
          {/* Header */}
          <div className="bg-yellow-400 px-3 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} className="text-gray-800" />
              <span className="font-bold text-sm text-gray-800">Chat Produksi</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-700 hover:text-gray-900">
              <X size={18} />
            </button>
          </div>

          {/* Batch selector */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <select
              value={activeBatchId ?? ""}
              onChange={(e) => setActiveBatchId(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
            >
              {batches.length === 0 && <option value="">Tidak ada batch aktif</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-gray-50">
            {!activeBatchId ? (
              <p className="text-center text-xs text-gray-400 mt-8">Pilih batch untuk mulai chat</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-xs text-gray-400 mt-8">Belum ada chat di batch ini</p>
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

          {/* Input */}
          <div className="p-2 border-t border-gray-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
              placeholder="Ketik pesan..."
              disabled={!activeBatchId}
              className="flex-1 text-xs border border-gray-200 rounded-full px-3 py-2 focus:outline-none focus:border-yellow-400 disabled:bg-gray-100"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !activeBatchId || sending}
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