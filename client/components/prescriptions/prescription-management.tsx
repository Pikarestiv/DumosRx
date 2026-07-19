"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PrescriptionQueue } from "./prescription-queue"
import { PrescriptionHistory } from "./prescription-history"
import { NewPrescription } from "./new-prescription"
import { RefillManagement } from "./refill-management"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function PrescriptionManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  
  const activeTab = searchParams.get("tab") || "queue";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="w-full md:w-max">
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
