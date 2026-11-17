export interface DuplicateCandidate {
  id: string;
  name: string;
  strength?: string | null;
  barcode?: string | null;
  category_name?: string | null;
}

export interface DuplicateQuery {
  id?: string;
  name: string;
  strength?: string;
  barcode?: string;
}

export interface DuplicateMatches<T extends DuplicateCandidate> {
  sameName: T | null;
  sameBarcode: T | null;
}

const normalise = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function findDuplicateProducts<T extends DuplicateCandidate>(
  query: DuplicateQuery,
  products: readonly T[],
): DuplicateMatches<T> {
  const name = normalise(query.name);
  const strength = normalise(query.strength);
  const barcode = (query.barcode ?? "").trim();
  const others = products.filter((p) => p.id !== query.id);

  return {
    sameName: name
      ? (others.find((p) => normalise(p.name) === name && normalise(p.strength) === strength) ?? null)
      : null,
    sameBarcode: barcode ? (others.find((p) => (p.barcode ?? "").trim() === barcode) ?? null) : null,
  };
}

export function findDuplicateProductIds<T extends DuplicateCandidate>(products: readonly T[]): Set<string> {
  const byName = new Map<string, string[]>();
  const byBarcode = new Map<string, string[]>();
  for (const p of products) {
    const name = normalise(p.name);
    const barcode = (p.barcode ?? "").trim();
    if (name) byName.set(`${name}|${normalise(p.strength)}`, [...(byName.get(`${name}|${normalise(p.strength)}`) ?? []), p.id]);
    if (barcode) byBarcode.set(barcode, [...(byBarcode.get(barcode) ?? []), p.id]);
  }
  const ids = new Set<string>();
  for (const group of [...byName.values(), ...byBarcode.values()]) {
    if (group.length > 1) group.forEach((id) => ids.add(id));
  }
  return ids;
}
