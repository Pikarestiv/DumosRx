import { use, Suspense } from "react";
import { DashboardClient } from "../dashboard-client";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { view: ["overview"] },
    { view: ["fleet"] },
    { view: ["store-details"] },
    { view: ["staff", "management"] },
    { view: ["staff", "activities"] },
    { view: ["billing"] },
    { view: ["downloads"] },
    { view: ["notifications"] },
    { view: ["profile"] },
  ];
}

export default function DashboardViewPage({ params }: { params: Promise<{ view: string[] }> }) {
  const { view } = use(params);
  const mainView = view[0];
  const subView = view[1];
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient view={mainView} subView={subView} />
    </Suspense>
  );
}
