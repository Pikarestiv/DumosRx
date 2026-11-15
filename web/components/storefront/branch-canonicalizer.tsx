"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import type { StorefrontBranch } from "@/lib/api/storefront-data";
import { canonicalBranchPath } from "@/lib/storefront-scope";
import { useCartStore } from "@/lib/store/use-cart-store";

interface BranchCanonicalizerProps {
  storeSlug: string;
  branches?: StorefrontBranch[];
}

export function BranchCanonicalizer({ storeSlug, branches }: BranchCanonicalizerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const primary = branches?.find((branch) => branch.is_primary) ?? branches?.[0];
  const multiBranch = (branches?.length ?? 0) > 1;

  useEffect(() => {
    if (!multiBranch || !primary?.slug) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("branch");
    const wanted = branches?.find((branch) => branch.id === requested || branch.slug === requested) ?? primary;
    const target = canonicalBranchPath(pathname ?? "", storeSlug, wanted.slug ?? primary.slug);
    if (!target) return;
    useCartStore.getState().moveCart(storeSlug, `${storeSlug}/${wanted.slug ?? primary.slug}`);
    params.delete("branch");
    const search = params.toString();
    router.replace(target + (search ? `?${search}` : "") + window.location.hash);
  }, [pathname, router, storeSlug, multiBranch, primary, branches]);

  return null;
}
