export function extractSpotSourcedProductIds(paymentDetails: unknown): Set<string> {
  if (!paymentDetails) return new Set<string>();
  try {
    const details =
      typeof paymentDetails === "string"
        ? JSON.parse(paymentDetails)
        : paymentDetails;
    const spotList = Array.isArray((details as { spot_sourcing?: unknown })?.spot_sourcing)
      ? (details as { spot_sourcing: { product_id?: string }[] }).spot_sourcing
      : [];
    return new Set<string>(
      spotList.map((s) => s.product_id).filter(Boolean) as string[],
    );
  } catch {
    return new Set<string>();
  }
}

