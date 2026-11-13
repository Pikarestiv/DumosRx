import { hasContactDetails } from "@/lib/storefront-display";

export interface StorefrontNavLink {
  label: string;
  href: string;
}

export function storefrontNavLinks(storeSlug: string, store?: Parameters<typeof hasContactDetails>[0] | null): StorefrontNavLink[] {
  const home = `/store/${storeSlug}`;
  const links = [
    { label: "Home", href: home },
    { label: "Shop", href: `${home}/catalog` },
  ];
  return store && hasContactDetails(store) ? [...links, { label: "Contact", href: `${home}#contact` }] : links;
}
