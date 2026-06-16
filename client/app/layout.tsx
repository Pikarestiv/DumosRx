import type React from "react";
import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthListener } from "@/components/auth-listener";
import { Toaster } from "@/components/ui/sonner";
import { DatabaseProvider } from "@/lib/db/DatabaseProvider";
import { StoreProvider } from "@/lib/context/store-context";
import { AuthProvider } from "@/lib/context/auth-context";
import { QuickSetupWizard } from "@/components/setup/quick-setup-wizard";
import { LicenseGuard } from "@/components/auth/license-guard";
import { APP_NAME } from "@/lib/constants";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TauriTitleBar } from "@/components/tauri/tauri-title-bar";
import { SystemConfigLoader } from "@/components/system-config-loader";

import { ErrorBoundary } from "@/components/tauri/error-boundary";
import { GlobalErrorListener } from "@/components/tauri/global-error-listener";
import { PwaRegistrar } from "@/components/pwa-registrar";
import { AutoUpdater } from "@/components/tauri/auto-updater";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} - NextGen Retail & Store OS`,
  description:
    "Professional business management system for retail stores and stores",
  generator: "v0.app",
  icons: {
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      className={`${inter.variable} ${montserrat.variable} antialiased`}
    >
      <body
        className="font-sans min-h-screen flex flex-col"
        suppressHydrationWarning
        style={{ "--tauri-top": "0px" } as React.CSSProperties}
      >
        <TauriTitleBar />
        <div className="flex-1 flex flex-col">
          <ErrorBoundary>
            <GlobalErrorListener>
              <ThemeProvider defaultTheme="light" storageKey="dumosrx-ui-theme">
                <TooltipProvider delayDuration={1000}>
                  <DatabaseProvider>
                    <AuthProvider>
                      <StoreProvider>
                        <SystemConfigLoader />
                        <AuthListener />
                        <QuickSetupWizard />
                        <LicenseGuard>{children}</LicenseGuard>
                        <Toaster />
                      </StoreProvider>
                    </AuthProvider>
                  </DatabaseProvider>
                </TooltipProvider>
              </ThemeProvider>
            </GlobalErrorListener>
          </ErrorBoundary>
        </div>
        <AutoUpdater />
        <PwaRegistrar />
      </body>
    </html>
  );
}
