"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard"

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <BusinessIntelligenceDashboard />
    </DashboardLayout>
  )
}
