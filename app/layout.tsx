import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthListener from "./components/AuthListener"; // We will define this logic below or you can keep it in the same file

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
        {/* This component handles the redirect when the Supabase token is detected */}
        <AuthListener /> 
        {children}
      </body>
    </html>
  );
}

// --- AUTH LISTENER COMPONENT ---
// Since layout.tsx is a Server Component, we use this sub-component 
// to handle client-side logic like redirects.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function AuthListener() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Force refresh to clear the hash fragment (#access_token...) from the URL
        // and move the user to the dashboard or home page
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