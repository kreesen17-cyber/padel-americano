import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// --- VIEWPORT CONFIGURATION ---
// This prevents the "auto-zoom" on mobile when tapping input fields
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// --- METADATA CONFIGURATION ---
export const metadata: Metadata = {
  title: "Padel Americano Pro",
  description: "Developer - Kreesen",
  manifest: "/manifest.json",
  icons: {
    apple: "/Padel-Pro_512.png", // High-res icon for iPhone home screens
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default", // Changed to default to better show your Gold strip
    title: "Padel Pro",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Extra fallback for older iOS versions */}
        <link rel="apple-touch-icon" href="/Padel-Pro_512.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#FAF9F6]">
        {children}
      </body>
    </html>
  );
}