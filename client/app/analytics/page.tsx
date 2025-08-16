import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard"

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Business Intelligence</h1>
        <p className="text-gray-600 mt-2">Comprehensive analytics and insights for your pharmacy operations</p>
      </div>
      <BusinessIntelligenceDashboard />
    </div>
  )
}
