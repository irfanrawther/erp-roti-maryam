import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Roti Maryam",
  description: "Sistem ERP Internal Produksi Roti Maryam",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/cane-logo.png",
    apple: "/cane-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
