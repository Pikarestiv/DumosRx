
import { FooterSection } from "@/components/landing/footer-section";
import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getStorefrontSlugs } from "@/lib/api/storefront-slugs";

interface CheckoutPageProps {
  params: {
    store_slug: string;
  };
}

export async function generateStaticParams() {
  return getStorefrontSlugs();
}

export default function CheckoutPage({ params }: CheckoutPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="font-bold text-xl text-emerald-700">
            Checkout
          </div>
          <div className="flex items-center space-x-4">
            <StorefrontCart storeSlug={params.store_slug} />
          </div>
        </div>
      </header>
      
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">
          Complete Your Order
        </h1>
        <CheckoutForm storeSlug={params.store_slug} />
      </main>

      <FooterSection />
    </div>
  );
}
