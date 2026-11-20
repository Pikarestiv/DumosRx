"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/auth/require-role";
import { PoOrderScreen } from "@/components/procurement/order-screen/po-order-screen";
import { PoResumeDraftPrompt } from "@/components/procurement/order-screen/po-resume-draft-prompt";
import { getRecentDraftForUser, type RecentDraft } from "@/lib/db/queries/procurement-draft-status";
import { getStoredUser } from "@/lib/storage-keys";

const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

function CreateOrderContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultSupplierId = searchParams.get("supplierId");
  const initialProductId = searchParams.get("productId");
  const savedOrderId = pathname === "/procurement/edit" ? searchParams.get("id") : null;
  const [userId] = useState(() => getStoredUser()?.id ?? null);
  const [recent, setRecent] = useState<RecentDraft | null | undefined>(userId ? undefined : null);

  useEffect(() => {
    if (!userId) return;
    getRecentDraftForUser(userId, new Date(Date.now() - RESUME_WINDOW_MS).toISOString())
      .then(setRecent)
      .catch(() => setRecent(null));
  }, [userId]);

  if (savedOrderId) return <PoOrderScreen key={savedOrderId} initialId={savedOrderId} />;
  if (recent === undefined) return null;
  if (recent) {
    return (
      <PoResumeDraftPrompt
        draft={recent}
        onContinue={() => router.replace(`/procurement/edit?id=${recent.id}`)}
        onStartNew={() => setRecent(null)}
      />
    );
  }
  return <PoOrderScreen initialId={null} defaultSupplierId={defaultSupplierId} initialProductId={initialProductId} />;
}

export default function CreateOrderPage() {
  return (
    <RequireRole permission="manage_purchase_orders">
      <Suspense fallback={null}>
        <CreateOrderContent />
      </Suspense>
    </RequireRole>
  );
}
