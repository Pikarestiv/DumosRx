import { Suspense } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MedicineDatabase } from "@/components/medicines/medicine-database"

export default function MedicinesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <MedicineDatabase />
      </Suspense>
    </DashboardLayout>
  )
}
