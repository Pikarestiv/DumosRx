import { use } from "react";
import { DashboardClient } from "../dashboard-client";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { view: "overview" },
    { view: "fleet" },
    { view: "staff" },
    { view: "billing" },
    { view: "downloads" },
    { view: "notifications" },
    { view: "profile" },
  ];
}

export default function DashboardViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = use(params);
  return <DashboardClient view={view} />;
}
