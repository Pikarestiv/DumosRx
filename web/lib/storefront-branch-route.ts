import { notFound } from "next/navigation";

import { NO_BRANCH_PLACEHOLDER } from "@/lib/api/storefront-slugs";
import { storefrontScope } from "@/lib/storefront-scope";

export interface BranchRouteProps {
  params: Promise<{ store_slug: string; branch: string }>;
}

export async function branchScopeProps({ params }: BranchRouteProps): Promise<{ params: Promise<{ store_slug: string }> }> {
  const { store_slug, branch } = await params;
  if (store_slug === NO_BRANCH_PLACEHOLDER) notFound();
  return { params: Promise.resolve({ store_slug: storefrontScope(store_slug, branch) }) };
}
