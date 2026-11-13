import { getStorefrontData } from "@/lib/api/storefront-data";
import { resolveStorefrontTheme, storefrontThemeCss } from "@/lib/storefront-themes";

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ store_slug: string }>;
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { store_slug } = await params;
  const data = await getStorefrontData(store_slug);
  const theme = resolveStorefrontTheme(data?.storefront?.theme);

  return (
    <div data-storefront-theme={theme.id} className="contents">
      <style>{storefrontThemeCss()}</style>
      {children}
    </div>
  );
}
