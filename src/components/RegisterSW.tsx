"use client";
import { useEffect } from "react";

// next-pwa (v5) menyuntikkan auto-register lewat webpack entry "main.js" —
// itu punya Pages Router lama. Project ini App Router, entry-nya "main-app",
// jadi auto-register next-pwa TIDAK PERNAH jalan sama sekali (dikonfirmasi:
// service worker tidak pernah terdaftar di device manapun, itu sebab utama
// push notification chat tidak pernah bisa tersubscribe). Daftarkan manual
// di sini supaya jalan di App Router.
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW register error:", err);
    });
  }, []);
  return null;
}
