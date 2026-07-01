import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Absensi",
  description: "Absensi Karyawan Cane RawtheR",
  manifest: "/absen-manifest.json",
  appleWebApp: {
    capable: true,
    title: "Absensi",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-absen-192.png",
    apple: "/icon-absen-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function AbsenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
