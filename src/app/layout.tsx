import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Engosoft Chatwoot Analytics",
  description: "Operational analytics for Engosoft customer service, agents, teams, campaigns, and SLA.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B6BF0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default to English/LTR on the server; LocaleProvider flips <html dir/lang> on
  // the client if the visitor previously chose Arabic. suppressHydrationWarning
  // keeps React from complaining about that intentional attribute swap.
  return (
    <html lang="en" dir="ltr" className={cairo.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
