import type { StorefrontPresetId } from "@/lib/types/storefront-settings";

export const STOREFRONT_PRESETS: { id: StorefrontPresetId; label: string; description: string }[] = [
  { id: "workshop", label: "Workshop", description: "Dark banner and square buttons. For hardware and general retail." },
  { id: "clinic", label: "Clinic", description: "Light, calm and rounded. For pharmacies." },
  { id: "studio", label: "Studio", description: "Elegant serif and outlined buttons. For beauty, spa and fashion." },
  { id: "market", label: "Market", description: "Bright and busy, built for large catalogues. For supermarkets." },
  { id: "boutique", label: "Boutique", description: "Soft and polished. For fashion and gift shops." },
  { id: "grove", label: "Grove", description: "Fresh and natural. For groceries and organic stores." },
];

export const presetLabel = (id: string): string | undefined => STOREFRONT_PRESETS.find((preset) => preset.id === id)?.label;

export const isStorefrontPreset = (id: string): id is StorefrontPresetId => STOREFRONT_PRESETS.some((preset) => preset.id === id);

export function joinLabels(ids: StorefrontPresetId[]): string {
  const labels = ids.map((id) => presetLabel(id) ?? id);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : (labels[0] ?? "");
}
