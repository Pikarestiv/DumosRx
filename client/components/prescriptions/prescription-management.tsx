"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PrescriptionQueue } from "./prescription-queue"
import { PrescriptionHistory } from "./prescription-history"
import { NewPrescription } from "./new-prescription"
import { RefillManagement } from "./refill-management"

export function PrescriptionManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">Prescription Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage prescriptions, track dispensing, and maintain patient medication records
        </p>
      </div>

      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="queue">Prescription Queue</TabsTrigger>
          <TabsTrigger value="new">New Prescription</TabsTrigger>
          <TabsTrigger value="refills">Refills</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <PrescriptionQueue />
        </TabsContent>

        <TabsContent value="new">
          <NewPrescription />
        </TabsContent>

        <TabsContent value="refills">
          <RefillManagement />
        </TabsContent>

        <TabsContent value="history">
          <PrescriptionHistory />
        </TabsContent>
      </Tabs>
    </div>
  )
}
