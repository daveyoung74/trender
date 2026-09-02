import type { Metadata } from "next";
import { IBM_Plex_Mono, Syne } from "next/font/google";
import { env } from "@/server/env";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: "Trender",
  description: "Treasury-launched Pump.fun coins from a GrokBot seed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${plex.variable} antialiased`}>{children}</body>
    </html>
  );
}
