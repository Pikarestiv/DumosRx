import { notFound } from "next/navigation";
import { HeaderSection } from "@/components/landing/header-section";
import { FooterSection } from "@/components/landing/footer-section";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StorefrontProps {
  params: {
    store_slug: string;
  };
}

async function getStorefrontData(store_slug: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const res = await fetch(`${apiUrl}/storefront/${store_slug}`, {
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!res.ok) {
    return null;
  }
  return res.json();
}

export async function generateStaticParams() {
  // For static exports (output: "export") on Namecheap/FTP hosting.
  // Manually add the slugs of pharmacies that have requested a storefront here.
  // Example: When a pharmacy wants 'health-first', add { store_slug: 'health-first' }
  // You will need to run 'npm run build' and upload the files again when you add a new one.
  return [
    { store_slug: 'demo' },
    // { store_slug: 'another-store' },
  ];
}

export default async function StorefrontPage({ params }: StorefrontProps) {
  const data = await getStorefrontData(params.store_slug);

  if (!data) {
    notFound();
  }

  const { store, products } = data;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderSection />
      
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            {store.name}
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            {store.location || store.address || "Your trusted local pharmacy, now online."}
          </p>
          {(store.phone || store.email) && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center md:justify-start justify-center">
              {store.phone && <Badge variant="secondary" className="text-md py-1 px-3">Call: {store.phone}</Badge>}
              {store.email && <Badge variant="secondary" className="text-md py-1 px-3">Email: {store.email}</Badge>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              No products are currently available online. Please check back later.
            </div>
          ) : (
            products.map((product: any) => (
              <Card key={product.id} className="flex flex-col h-full hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-2">{product.name}</CardTitle>
                    {product.requires_prescription && (
                      <Badge variant="destructive" className="ml-2 whitespace-nowrap text-[10px]">Rx</Badge>
                    )}
                  </div>
                  {product.generic_name && (
                    <p className="text-sm text-muted-foreground">{product.generic_name}</p>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-2xl font-bold text-emerald-600 mt-2">
                    ₦{parseFloat(product.selling_price).toLocaleString()}
                  </p>
                  {product.category && (
                    <Badge variant="outline" className="mt-4">{product.category.name}</Badge>
                  )}
                </CardContent>
                <CardFooter>
                  <Button className="w-full" size="lg">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </main>

      <FooterSection />
    </div>
  );
}
