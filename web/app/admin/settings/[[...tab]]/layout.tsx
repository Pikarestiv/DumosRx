export function generateStaticParams() {
  return [
    { tab: [] },
    { tab: ['health'] },
    { tab: ['billing'] },
    { tab: ['suggestions'] },
    { tab: ['templates'] },
    { tab: ['integrations'] },
  ];
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
