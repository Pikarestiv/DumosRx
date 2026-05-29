import { Metadata } from "next"
import { CouponsManager } from "@/components/admin/marketing/coupons-manager"

export const metadata: Metadata = {
  title: "Coupons | DumosRx Admin",
  description: "Manage subscription coupons and trials",
}

export default function CouponsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <CouponsManager />
    </div>
  )
}
