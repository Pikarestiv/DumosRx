import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Business Intelligence & Reports
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive analytics and insights for your pharmacy operations
        </p>
      </div>
      <BusinessIntelligenceDashboard />
    </DashboardLayout>
  );
}
