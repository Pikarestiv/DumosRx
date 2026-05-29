import { Metadata } from "next"
import { CouponsManager } from "@/components/admin/marketing/coupons-manager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = {
  title: "Marketing | DumosRx Admin",
  description: "Manage marketing campaigns and coupons",
}

export default function MarketingPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Marketing hub</h2>
          <p className="text-muted-foreground">Manage campaigns, affiliates, and promotional discounts.</p>
        </div>
      </div>

      <Tabs defaultValue="coupons" className="space-y-4">
        <TabsList>
          <TabsTrigger value="coupons">Coupons & Trials</TabsTrigger>
          <TabsTrigger value="affiliates" disabled>Affiliates (Soon)</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons" className="space-y-4">
          <CouponsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
