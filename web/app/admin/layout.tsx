import type { Metadata } from "next";
import { AdminPwaRegistrar } from "@/components/admin/admin-pwa-registrar";
import { AdminLayoutClient } from "@/components/admin/admin-layout-client";

export const metadata: Metadata = {
  manifest: "/admin-manifest.webmanifest",
  appleWebApp: { capable: true, title: "DumosRx Admin" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminPwaRegistrar />
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </>
  );
}
