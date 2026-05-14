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
  description: "The ultimate Padel Americano tournament organizer.",
  manifest: "/manifest.json",
  icons: {
    icon: "/Padel-Pro_512.png",
    apple: "/Padel-Pro_512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
        <link rel="apple-touch-icon" href="/padel_americano_pro.png" />
        <link rel="icon" type="image/png" href="/padel_americano_pro.png" />
        <link rel="shortcut icon" href="/Padel-Pro_512.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#FAF9F6]">
        <AuthListener />
        {children}
      </body>
    </html>
  );
}

// --- AUTH LISTENER COMPONENT ---
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function AuthListener() {
  const router = useRouter();

  // Initialize the browser client directly
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // When the token is detected in the URL, this event fires
      if (event === "SIGNED_IN" && session) {
        // Redirect to home and refresh to update the UI state
        router.push("/");
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  return null;
}