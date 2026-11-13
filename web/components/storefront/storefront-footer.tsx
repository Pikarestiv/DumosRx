import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { APP_NAME, WEB_APP_URL } from "@/lib/constants";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { hasContactDetails, storeAddressLine } from "@/lib/storefront-display";
import { storefrontNavLinks } from "@/lib/storefront-nav";

interface StorefrontFooterProps {
  storeSlug: string;
  store?: StorefrontStore | null;
  storefront?: StorefrontProfile | null;
}

const ABOUT_PREVIEW_LENGTH = 220;

function aboutPreview(about?: string | null): string | null {
  const text = about?.trim();
  if (!text) return null;
  return text.length > ABOUT_PREVIEW_LENGTH ? `${text.slice(0, ABOUT_PREVIEW_LENGTH).trimEnd()}…` : text;
}

export function StorefrontFooter({ storeSlug, store, storefront }: StorefrontFooterProps) {
  const businessName = storefront?.name || store?.name || "This store";
  const about = aboutPreview(storefront?.about) ?? storefront?.headline ?? null;
  const address = store ? storeAddressLine(store) : null;

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-10 md:grid-cols-[2fr_1fr_1.5fr]">
        <div className="space-y-3">
          <p className="font-heading text-lg font-bold">{businessName}</p>
          {about && <p className="text-sm leading-relaxed">{about}</p>}
        </div>

        <nav aria-label="Footer" className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest">Quick links</p>
          <ul className="space-y-2 text-sm">
            {storefrontNavLinks(storeSlug, store).map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="hover:underline underline-offset-4">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {store && hasContactDetails(store) && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest">Contact</p>
            <ul className="space-y-2 text-sm">
              {store?.phone && (
                <FooterContact icon={<Phone className="h-4 w-4" />}>
                  <a href={`tel:${store.phone}`} className="hover:underline underline-offset-4">{store.phone}</a>
                </FooterContact>
              )}
              {store?.email && (
                <FooterContact icon={<Mail className="h-4 w-4" />}>
                  <a href={`mailto:${store.email}`} className="hover:underline underline-offset-4 break-all">{store.email}</a>
                </FooterContact>
              )}
              {address && <FooterContact icon={<MapPin className="h-4 w-4" />}>{address}</FooterContact>}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-primary-foreground/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p>
            © {new Date().getFullYear()} {businessName}
          </p>
          <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">
            Powered by {APP_NAME}
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterContact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 opacity-80" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
