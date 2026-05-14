import type React from "react";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthListener } from "@/components/auth-listener";
import { Toaster } from "@/components/ui/sonner";
import { DatabaseProvider } from "@/lib/db/DatabaseProvider";
import { StoreProvider } from "@/lib/context/store-context";
import { AuthProvider } from "@/lib/context/auth-context";
import { QuickSetupWizard } from "@/components/setup/quick-setup-wizard";
import { LicenseGuard } from "@/components/auth/license-guard";
import { DevSeedButton } from "@/components/dev/seed-button";
import { isTauri } from "@/lib/db/core";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { TauriTitleBar } from "@/components/tauri/tauri-title-bar";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
  weight: ["400", "600", "700", "900"],
});

const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-open-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} - NextGen Retail & Pharmacy OS`,
  description:
    "Professional business management system for retail stores and pharmacies",
  generator: "v0.app",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tauri = isTauri();

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${openSans.variable} antialiased`}
    >
      <body 
        className="font-sans min-h-screen flex flex-col" 
        suppressHydrationWarning
        style={{ "--tauri-top": tauri ? "40px" : "0px" } as React.CSSProperties}
      >
        <TauriTitleBar />
        <div className="flex-1 flex flex-col">
          <ThemeProvider defaultTheme="system" storageKey="dumosrx-ui-theme">
          <DatabaseProvider>
            <StoreProvider>
              <AuthProvider>
                <AuthListener />
                <QuickSetupWizard />
                <LicenseGuard>
                  {children}
                </LicenseGuard>
                <Toaster />
                {/* Dev utility: remove in production */}
                {process.env.NODE_ENV === 'development' && <DevSeedButton />}
              </AuthProvider>
            </StoreProvider>
          </DatabaseProvider>
        </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
