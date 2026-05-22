import SettingsClient from "./settings-client";

export function generateStaticParams() {
  return [
    { tab: "appearance" },
    { tab: "store" },
    { tab: "notifications" },
    { tab: "data" },
    { tab: "security" },
    { tab: "staff" },
    { tab: "system" },
    { tab: "cloud" },
  ];
}

export default function SettingsPage() {
  return <SettingsClient />;
}
