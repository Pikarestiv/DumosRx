import { storeAddressLine } from "@/lib/storefront-display";
import { summarizeHours } from "@/lib/storefront-hours";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";

interface StoreInfoPanelProps {
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
}

export function storeInfoRows({ store, storefront }: StoreInfoPanelProps): { label: string; value: string }[] {
  const pickup = storefront?.pickup_minutes;
  const rows = [
    { label: "Address", value: storeAddressLine(store) },
    { label: "Hours", value: summarizeHours(storefront?.opening_hours) },
    { label: "Phone", value: store.phone?.trim() || null },
    { label: "Payment", value: store.online_payment_available ? "Online or at pickup" : "At pickup" },
    { label: "Pickup", value: pickup ? `Ready in about ${pickup} min` : null },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}

export function StoreInfoPanel(props: StoreInfoPanelProps) {
  const rows = storeInfoRows(props);
  if (rows.length === 0) return null;

  return (
    <aside
      aria-label="Store information"
      className="self-start rounded-[var(--sf-card-radius)] border border-current/15 bg-white/5 p-6"
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[color:var(--primary)]">The store</h2>
      <dl className="mt-4">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-6 border-t border-current/15 py-3 text-sm">
            <dt className="opacity-70">{row.label}</dt>
            <dd className="text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
