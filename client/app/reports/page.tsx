import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ReportCenter } from "@/components/reports/report-center";
import { useStore } from "@/lib/context/store-context";

export default function ReportsPage() {
  const { t } = useStore();
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Reporting Center
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate, schedule, and export detailed operational reports for your {t('store').toLowerCase()}
        </p>
      </div>
      <ReportCenter />
    </DashboardLayout>
  );
}
