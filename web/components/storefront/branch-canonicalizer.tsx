"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import type { StorefrontBranch } from "@/lib/api/storefront-data";
import { canonicalBranchPath } from "@/lib/storefront-scope";

interface BranchCanonicalizerProps {
  storeSlug: string;
  branches?: StorefrontBranch[];
}

export function BranchCanonicalizer({ storeSlug, branches }: BranchCanonicalizerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const primary = branches?.find((branch) => branch.is_primary) ?? branches?.[0];
  const primarySlug = (branches?.length ?? 0) > 1 ? primary?.slug : undefined;

  useEffect(() => {
    const target = primarySlug ? canonicalBranchPath(pathname ?? "", storeSlug, primarySlug) : null;
    if (target) router.replace(target + window.location.search + window.location.hash);
  }, [pathname, router, storeSlug, primarySlug]);

  return null;
}
