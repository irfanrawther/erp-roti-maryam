import withPWA from 'next-pwa';

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withPWA({
  dest: 'public',
  importScripts: ['push-sw.js'],
  // app-build-manifest.json (dan file internal .next lain yang next-pwa
  // ikut scan) tidak benar-benar bisa diakses publik (404 di Vercel) —
  // kalau ikut di-precache, instalasi SERVICE WORKER GAGAL TOTAL setiap
  // kali (workbox precacheAndRoute menolak install kalau ada satu saja
  // aset yang fetch-nya gagal). Ini yang bikin push notification chat
  // tidak pernah bisa aktif sejak awal, terbukti dari testing langsung.
  buildExcludes: [/app-build-manifest\.json$/],
})(nextConfig);