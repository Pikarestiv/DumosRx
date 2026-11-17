export interface ServiceCategoryGroup {
  name: string;
  count: number;
}

const tidy = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ");

export const sameServiceCategory = (a?: string | null, b?: string | null) =>
  tidy(a).toLowerCase() === tidy(b).toLowerCase();

export function groupServiceCategories(services: ReadonlyArray<{ category?: string | null }>): ServiceCategoryGroup[] {
  const groups = new Map<string, Map<string, number>>();
  for (const { category } of services) {
    const spelling = tidy(category);
    if (!spelling) continue;
    const spellings = groups.get(spelling.toLowerCase()) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
    groups.set(spelling.toLowerCase(), spellings);
  }
  return [...groups.values()]
    .map((spellings) => ({
      name: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: [...spellings.values()].reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveServiceCategory(input: string, existing: readonly string[]): string | null {
  const typed = tidy(input);
  if (!typed) return null;
  return existing.find((name) => sameServiceCategory(name, typed)) ?? typed;
}
