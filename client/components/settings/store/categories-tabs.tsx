"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriesCard } from "./categories-card";
import { ServiceCategoriesCard } from "./service-categories-card";

const SERVICES_TAB = "services";

export function CategoriesTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("type") === SERVICES_TAB ? SERVICES_TAB : "products";

  const select = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === SERVICES_TAB) params.set("type", SERVICES_TAB);
    else params.delete("type");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <Tabs value={active} onValueChange={select} className="space-y-4">
      <TabsList>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value={SERVICES_TAB}>Services</TabsTrigger>
      </TabsList>
      <TabsContent value="products">
        <CategoriesCard />
      </TabsContent>
      <TabsContent value={SERVICES_TAB}>
        <ServiceCategoriesCard />
      </TabsContent>
    </Tabs>
  );
}
