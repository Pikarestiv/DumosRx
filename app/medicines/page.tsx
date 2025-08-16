import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MedicineDatabase } from "@/components/medicines/medicine-database"

export default function MedicinesPage() {
  return (
    <DashboardLayout>
      <MedicineDatabase />
    </DashboardLayout>
  )
}
