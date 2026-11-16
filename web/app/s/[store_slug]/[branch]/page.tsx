import type { Metadata } from "next";

import StorefrontPage, { generateMetadata as baseMetadata } from "@/app/s/[store_slug]/page";
import { getStorefrontBranchParams } from "@/lib/api/storefront-slugs";
import { branchScopeProps, type BranchRouteProps } from "@/lib/storefront-branch-route";

export async function generateStaticParams() {
  return getStorefrontBranchParams();
}

export async function generateMetadata(props: BranchRouteProps): Promise<Metadata> {
  return baseMetadata(await branchScopeProps(props));
}

export default async function BranchRoute(props: BranchRouteProps) {
  return StorefrontPage(await branchScopeProps(props));
}
