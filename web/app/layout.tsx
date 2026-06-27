import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DumosRx - NextGen Retail & Store OS",
    template: "%s | DumosRx",
  },
  description: "Professional business management system for retail stores. Offline-first, cloud-synced, and built for growth.",
  keywords: ["store management", "retail OS", "offline POS", "stock_batch management", "DumosRx"],
  authors: [{ name: "Dumos Technologies" }],
  creator: "Dumos Technologies",
  publisher: "Dumos Technologies",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://dumosrx.com",
    title: "DumosRx - NextGen Retail & Store OS",
    description: "Professional business management system for retail stores. Offline-first, cloud-synced, and built for growth.",
    siteName: "DumosRx",
    images: [
      {
        url: "https://dumosrx.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "DumosRx Dashboard Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DumosRx - NextGen Retail & Store OS",
    description: "Professional business management system for retail stores. Offline-first, cloud-synced, and built for growth.",
    creator: "@dumosrx",
    images: ["https://dumosrx.com/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

import { Providers } from "@/components/providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${montserrat.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
