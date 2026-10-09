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
    { tab: ["admin-permissions"] },
    // Without an entry here the tab 404s on a direct visit or reload under
    // `output: "export"`. account-manager was missing one; see KNOWN_BUGS A-200.
    { tab: ["account-manager"] },
    { tab: ["till-codes"] },
  ];
}

export default function PlatformSettingsPage() {
  return <PlatformSettingsClient />;
}
