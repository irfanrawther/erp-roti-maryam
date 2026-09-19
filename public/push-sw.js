// Custom service worker additions — digabung otomatis oleh next-pwa ke
// public/sw.js hasil build (lihat swSrc di next.config.js). Bagian workbox
// (precache dsb) tetap otomatis dari next-pwa; ini cuma nambah listener
// push notification untuk Chat.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pesan baru", body: event.data.text() };
  }
  const title = payload.title || "Pesan baru";
  const options = {
    body: payload.body || "",
    icon: "/logo-cane.png",
    badge: "/logo-cane.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
