import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Era Ball",
  description: "NBA fantasy draft and simulation game across eras",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable} h-full`}>
      <head>
        {/* Start fetching player data immediately on HTML parse, before JS loads */}
        <link rel="preload" href="/players_with_stats.json" as="fetch" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full bg-black text-white antialiased" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
