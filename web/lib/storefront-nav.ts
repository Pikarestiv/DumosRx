export interface StorefrontNavLink {
  label: string;
  href: string;
}

export function storefrontNavLinks(storeSlug: string): StorefrontNavLink[] {
  const home = `/store/${storeSlug}`;
  return [
    { label: "Home", href: home },
    { label: "Shop", href: `${home}/catalog` },
    { label: "Contact", href: `${home}#contact` },
  ];
}
