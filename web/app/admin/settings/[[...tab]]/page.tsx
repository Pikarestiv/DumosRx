import PlatformSettingsClient from "./settings-client";

export function generateStaticParams() {
  return [
    { tab: [] },
    { tab: ["health"] },
    { tab: ["billing"] },
    { tab: ["suggestions"] },
    { tab: ["templates"] },
    { tab: ["integrations"] },
    { tab: ["security"] },
  ];
}

export default function PlatformSettingsPage() {
  return <PlatformSettingsClient />;
}
