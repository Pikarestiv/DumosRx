import {
  boundedLevenshteinDistance,
  MIN_FUZZY_TERM_LENGTH,
  maxFuzzyDistanceFor,
} from "./fuzzy-distance";

export { boundedLevenshteinDistance, calculateLevenshteinDistance } from "./fuzzy-distance";
export { genericFuzzySearch } from "./generic-fuzzy-search";

export interface SearchProductResult<T> {
  results: T[];
  isFuzzyFallback: boolean;
}

// A squashed term shorter than this matches too much mid-string once spaces are gone ("nc" hits "zinc" and "vitamin c" alike), so below it onl…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-search-ts-L63
const MIN_SQUASHED_SUBSTRING_LENGTH = 4;

interface LowercasedProduct {
  name: string;
  generic: string;
  barcode: string;
  nameWords: string[];
  genericWords: string[];
  squashedName: string;
  squashedGeneric: string;
  squashedWords: string[];
}

// Per-array cache of the lowercased searchable fields.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-search-L95
const lowercaseIndexCache = new WeakMap<object, LowercasedProduct[]>();

function lowercaseIndexFor<
  T extends {
    name: string;
    generic_name?: string | null;
    barcode?: string | null;
  },
>(products: T[]): LowercasedProduct[] {
  const cached = lowercaseIndexCache.get(products);
  if (cached) return cached;

  const index = products.map((med) => {
    const name = med.name.toLowerCase();
    const generic = (med.generic_name || "").toLowerCase();
    return {
      name,
      generic,
      barcode: (med.barcode || "").toLowerCase(),
      nameWords: name.split(/\s+/),
      genericWords: generic ? generic.split(/\s+/) : [],
      squashedName: squashForMatching(name),
      squashedGeneric: squashForMatching(generic),
      squashedWords: name.split(/\s+/).map(squashForMatching).filter(Boolean),
    };
  });

  lowercaseIndexCache.set(products, index);
  return index;
}

// Strips everything that isn't a letter or digit, so the spellings a cashier types interchangeably — "M&B", "M B", "M & B", "MB" — collapse to…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-search-ts-L128
export function squashForMatching(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function searchProducts<
  T extends {
    name: string;
    generic_name?: string | null;
    barcode?: string | null;
  },
>(searchTerm: string, products: T[]): SearchProductResult<T> {
  const term = searchTerm.trim().toLowerCase();

  if (!term) {
    return { results: products, isFuzzyFallback: false };
  }

  const tokens = term.split(/\s+/).filter(Boolean);
  const squashedTerm = squashForMatching(term);

  // 1. Initial Strict Search (Tiers 1-3)
  const index = lowercaseIndexFor(products);

  const scoredResults = products
    .map((med, i) => {
      const { name, generic, barcode } = index[i];

      let score = 0;

      // Tier 1: Exact Match
      if (
        name === term ||
        barcode === term ||
        generic === term
      ) {
        score += 100;
      }

      // Tier 2: Starts With
      if (
        name.startsWith(term) ||
        generic.startsWith(term)
      ) {
        score += 50;
      }

      // Tier 3: Multi-word Token Match
      if (tokens.length > 0) {
        const allTokensMatch = tokens.every(
          (token) =>
            name.includes(token) ||
            generic.includes(token) ||
            barcode.includes(token),
        );
        if (allTokensMatch) {
          score += 20;
        }
      }

      // Tier 3.5: punctuation-insensitive match, graded.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-search-ts-L183
      if (score === 0 && squashedTerm) {
        const { squashedName, squashedGeneric, squashedWords } = index[i];

        if (squashedName === squashedTerm || squashedGeneric === squashedTerm) {
          score += 18;
        } else if (
          squashedName.startsWith(squashedTerm) ||
          (squashedGeneric && squashedGeneric.startsWith(squashedTerm))
        ) {
          score += 14;
        } else if (squashedWords.some((word) => word.startsWith(squashedTerm))) {
          score += 12;
        } else if (
          squashedTerm.length >= MIN_SQUASHED_SUBSTRING_LENGTH &&
          (squashedName.includes(squashedTerm) ||
            (squashedGeneric && squashedGeneric.includes(squashedTerm)))
        ) {
          score += 6;
        }
      }

      return { med, score };
    })
    .filter((item) => item.score > 0);

  if (scoredResults.length > 0) {
    // Sort by score descending, then alphabetically by name
    scoredResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.med.name.localeCompare(b.med.name);
    });

    return {
      results: scoredResults.map((r) => r.med),
      isFuzzyFallback: false,
    };
  }

  // 4. Tier 4: Fuzzy Fallback (Only if no strict results and term is long enough)
  if (term.length < MIN_FUZZY_TERM_LENGTH) {
    return { results: [], isFuzzyFallback: false };
  }

  const maxDistance = maxFuzzyDistanceFor(term.length);

  const fuzzyResults = products
    .map((med, i) => {
      const entry = index[i];
      const name = entry.name;

      // 1. Compare against the full name prefix
      let minDistance = boundedLevenshteinDistance(
        term,
        name.substring(0, term.length + 2),
        maxDistance,
      );

      // 2. Compare against individual words in the name
      for (const word of entry.nameWords) {
        minDistance = Math.min(
          minDistance,
          boundedLevenshteinDistance(
            term,
            word.substring(0, term.length + 2),
            maxDistance,
          ),
        );
      }

      if (entry.generic) {
        const generic = entry.generic;
        minDistance = Math.min(
          minDistance,
          boundedLevenshteinDistance(
            term,
            generic.substring(0, term.length + 2),
            maxDistance,
          ),
        );
        for (const word of entry.genericWords) {
          minDistance = Math.min(
            minDistance,
            boundedLevenshteinDistance(
              term,
              word.substring(0, term.length + 2),
              maxDistance,
            ),
          );
        }
      }

      // A scanned barcode with no exact match previously fell straight through to fuzzy-matching against product NAMES, with barcode never scored at…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-search-ts-L280
      if (entry.barcode) {
        const barcode = entry.barcode;
        minDistance = Math.min(
          minDistance,
          boundedLevenshteinDistance(
            term,
            barcode.substring(0, term.length + 2),
            maxDistance,
          ),
        );
      }

      return { med, distance: minDistance };
    })
    .filter((item) => item.distance <= maxDistance);

  if (fuzzyResults.length > 0) {
    fuzzyResults.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.med.name.localeCompare(b.med.name);
    });

    // Return top 5 fuzzy suggestions
    return {
      results: fuzzyResults.slice(0, 5).map((r) => r.med),
      isFuzzyFallback: true,
    };
  }

  return { results: [], isFuzzyFallback: false };
}
