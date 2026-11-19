"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { queryKeys } from "@/lib/query-keys";
import { getRecoveredCopies } from "@/lib/db/procurement-recovered-copy";
import { PoSaveBanner } from "./order-screen/po-save-status";

export function RecoveredCopiesNotice() {
  const router = useRouter();
  const { data: copies = [] } = useQuery({ ...queryKeys.procurement.recoveredCopies(), queryFn: getRecoveredCopies });
  if (copies.length === 0) return null;
  const [latest] = copies;
  return (
    <div className="mb-3">
      <PoSaveBanner
        tone="warning"
        title={copies.length === 1 ? "An order edit was kept as a recovered copy" : `${copies.length} order edits were kept as recovered copies`}
        description="Another till changed these orders before this till's edits reached the cloud. Nothing typed here was lost: check each recovered draft, then keep it or delete it."
        actions={[{ label: copies.length === 1 ? "Open the recovered draft" : "Open the latest", run: () => router.push(`/procurement/edit?id=${latest.id}`) }]}
      />
    </div>
  );
}
