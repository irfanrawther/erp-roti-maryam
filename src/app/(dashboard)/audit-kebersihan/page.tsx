"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserSession, type UserSession } from "@/lib/auth";
import { getCapabilities, homeRoute } from "@/lib/permissions";
import { ClipboardCheck } from "lucide-react";
import AuditTab from "./AuditTab";
import RosterTab from "./RosterTab";

export default function AuditKebersihanPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [tab, setTab] = useState<"audit" | "roster">("audit");

  useEffect(() => {
    const u = getUserSession(); setUser(u);
    if (!u || !getCapabilities(u).auditKebersihan) { router.replace(homeRoute(u)); return; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={20} className="text-teal-500" />
        <h1 className="text-xl font-bold text-gray-800">Audit Kebersihan</h1>
      </div>

      <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1 max-w-sm">
        {([["audit", "Audit"], ["roster", "Roster Job Desc"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-teal-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "audit" ? <AuditTab /> : <RosterTab />}
    </div>
  );
}
