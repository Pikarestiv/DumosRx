import { Suspense } from "react";
import SettingsClient from "./settings-client";

export function generateStaticParams() {
  return [
    { tab: "general" },
    { tab: "appearance" },
    { tab: "store" },
    { tab: "alerts" },
    { tab: "notifications" },
    { tab: "data" },
    { tab: "security" },
    { tab: "staff" },
    { tab: "system" },
    { tab: "cloud" },
  ];
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 flex items-center justify-center min-h-screen">Loading settings...</div>}>
      <SettingsClient />
    </Suspense>
  );
}
