import { use, Suspense } from "react";
import { DashboardClient } from "../dashboard-client";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { view: "overview" },
    { view: "fleet" },
    { view: "store-details" },
    { view: "staff" },
    { view: "billing" },
    { view: "downloads" },
    { view: "notifications" },
    { view: "profile" },
    { view: "activities" },
  ];
}

export default function DashboardViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = use(params);
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient view={view} />
    </Suspense>
  );
}
