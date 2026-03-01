"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";
import { useStore } from "@/lib/context/store-context";

export default function ReportsPage() {
  const { t } = useStore();
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Business Intelligence & Reports
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive analytics and insights for your {t('store').toLowerCase()} operations
        </p>
      </div>
      <BusinessIntelligenceDashboard />
    </DashboardLayout>
  );
}
