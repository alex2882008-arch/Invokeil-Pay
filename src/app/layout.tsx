import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/hooks/use-theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Invokeil Pay — Personal MFS Payment Automation",
  description: "Self-hosted personal payment gateway for Bangladesh — bKash, Nagad, Rocket, Upay & 50+ gateways with SMS auto-verification, invoices, payment links and a merchant API.",
  keywords: ["Invokeil Pay", "payment automation", "bKash", "Nagad", "Rocket", "Upay", "personal gateway", "merchant API"],
  authors: [{ name: "Invokeil Pay" }],
  icons: {
    icon: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#2563EB"/><path d="M15 24h14M22 17l7 7-7 7" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  },
  openGraph: {
    title: "Invokeil Pay — Personal MFS Payment Automation",
    description: "Self-hosted personal payment gateway with SMS auto-verification",
    siteName: "Invokeil Pay",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1729" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
