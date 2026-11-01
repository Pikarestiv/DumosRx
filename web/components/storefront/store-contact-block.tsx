import { Mail, MapPin, Phone } from "lucide-react";

import type { StorefrontStore } from "@/lib/api/storefront-data";
import { storeAddressLine } from "@/lib/storefront-display";

export function StoreContactBlock({ store }: { store: StorefrontStore }) {
  const address = storeAddressLine(store);

  if (!address && !store.phone && !store.email) {
    return null;
  }

  return (
    <address className="not-italic grid gap-3 sm:grid-cols-3 rounded-2xl border border-border bg-background p-4 text-sm">
      {address && (
        <ContactRow icon={<MapPin className="h-4 w-4" />} label="Address">
          {address}
        </ContactRow>
      )}
      {store.phone && (
        <ContactRow icon={<Phone className="h-4 w-4" />} label="Phone">
          <a href={`tel:${store.phone}`} className="hover:text-primary">
            {store.phone}
          </a>
        </ContactRow>
      )}
      {store.email && (
        <ContactRow icon={<Mail className="h-4 w-4" />} label="Email">
          <a href={`mailto:${store.email}`} className="hover:text-primary break-all">
            {store.email}
          </a>
        </ContactRow>
      )}
    </address>
  );
}

function ContactRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-primary" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}
