"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { RequireRole } from "@/components/auth/require-role";
import { PoOrderScreen } from "@/components/procurement/order-screen/po-order-screen";

function EditOrderContent() {
  const id = useSearchParams().get("id");
  if (!id) return null;
  return <PoOrderScreen key={id} initialId={id} />;
}

export default function EditOrderPage() {
  return (
    <RequireRole permission="manage_purchase_orders">
      <Suspense
        fallback={
          <div className="p-10 flex items-center justify-center">
            <Clock className="animate-spin text-muted-foreground w-6 h-6" />
          </div>
        }
      >
        <EditOrderContent />
      </Suspense>
    </RequireRole>
  );
}
