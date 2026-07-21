/**
 * Calculates the Levenshtein distance between two strings.
 * This measures the minimum number of single-character edits required to change one word into the other.
 */
export function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          ),
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

export interface SearchProductResult<T> {
  results: T[];
  isFuzzyFallback: boolean;
}

export function searchProducts<
  T extends {
    name: string;
    generic_name?: string | null;
    brand?: string | null;
    barcode?: string | null;
  },
>(searchTerm: string, products: T[]): SearchProductResult<T> {
  const term = searchTerm.trim().toLowerCase();

  if (!term) {
    return { results: products, isFuzzyFallback: false };
  }

  const tokens = term.split(/\s+/).filter(Boolean);

  // 1. Initial Strict Search (Tiers 1-3)
  const scoredResults = products
    .map((med) => {
      const name = med.name.toLowerCase();
      const generic = (med.generic_name || "").toLowerCase();
      const brand = (med.brand || "").toLowerCase();
      const barcode = (med.barcode || "").toLowerCase();

      let score = 0;

      // Tier 1: Exact Match
      if (
        name === term ||
        barcode === term ||
        brand === term ||
        generic === term
      ) {
        score += 100;
      }

      // Tier 2: Starts With
      if (
        name.startsWith(term) ||
        generic.startsWith(term) ||
        brand.startsWith(term)
      ) {
        score += 50;
      }

      // Tier 3: Multi-word Token Match
      if (tokens.length > 0) {
        const allTokensMatch = tokens.every(
          (token) =>
            name.includes(token) ||
            generic.includes(token) ||
            brand.includes(token) ||
            barcode.includes(token),
        );
        if (allTokensMatch) {
          score += 20;
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
  if (term.length < 3) {
    return { results: [], isFuzzyFallback: false };
  }

  const fuzzyResults = products
    .map((med) => {
      const name = med.name.toLowerCase();

      // 1. Compare against the full name prefix
      let minDistance = calculateLevenshteinDistance(
        term,
        name.substring(0, term.length + 2),
      );

      // 2. Compare against individual words in the name
      for (const word of name.split(/\s+/)) {
        minDistance = Math.min(
          minDistance,
          calculateLevenshteinDistance(
            term,
            word.substring(0, term.length + 2),
          ),
        );
      }

      if (med.generic_name) {
        const generic = med.generic_name.toLowerCase();
        minDistance = Math.min(
          minDistance,
          calculateLevenshteinDistance(
            term,
            generic.substring(0, term.length + 2),
          ),
        );
        for (const word of generic.split(/\s+/)) {
          minDistance = Math.min(
            minDistance,
            calculateLevenshteinDistance(
              term,
              word.substring(0, term.length + 2),
            ),
          );
        }
      }

      if (med.brand) {
        const brand = med.brand.toLowerCase();
        minDistance = Math.min(
          minDistance,
          calculateLevenshteinDistance(
            term,
            brand.substring(0, term.length + 2),
          ),
        );
        for (const word of brand.split(/\s+/)) {
          minDistance = Math.min(
            minDistance,
            calculateLevenshteinDistance(
              term,
              word.substring(0, term.length + 2),
            ),
          );
        }
      }

      return { med, distance: minDistance };
    })
    .filter((item) => item.distance <= 3); // Allow max 3 typos

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

export function genericFuzzySearch<T>(
  searchTerm: string,
  items: T[],
  searchKeys: (keyof T)[],
): { results: T[]; isFuzzyFallback: boolean } {
  const term = searchTerm.trim().toLowerCase();

  if (!term) {
    return { results: items, isFuzzyFallback: false };
  }

  const tokens = term.split(/\s+/).filter(Boolean);

  const scoredResults = items
    .map((item) => {
      let score = 0;

      // Extract search string from all keys
      const values = searchKeys.map((key) => {
        const val = item[key];
        return val ? String(val).toLowerCase() : "";
      });

      // Tier 1: Exact Match
      if (values.some((v) => v === term)) {
        score += 100;
      }

      // Tier 2: Starts With
      if (values.some((v) => v.startsWith(term))) {
        score += 50;
      }

      // Tier 3: Multi-word Token Match
      if (tokens.length > 0) {
        const allTokensMatch = tokens.every((token) =>
          values.some((v) => v.includes(token)),
        );
        if (allTokensMatch) {
          score += 20;
        }
      }

      return { item, score };
    })
    .filter((res) => res.score > 0);

  if (scoredResults.length > 0) {
    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);
    return {
      results: scoredResults.map((r) => r.item),
      isFuzzyFallback: false,
    };
  }

  // Tier 4: Fuzzy Fallback
  if (term.length < 3) {
    return { results: [], isFuzzyFallback: false };
  }

  const fuzzyResults = items
    .map((item) => {
      let minDistance = 999;

      for (const key of searchKeys) {
        const val = item[key];
        if (val) {
          const strVal = String(val).toLowerCase();
          // 1. Compare with substring of similar length to term
          const dist = calculateLevenshteinDistance(
            term,
            strVal.substring(0, term.length + 2),
          );
          if (dist < minDistance) {
            minDistance = dist;
          }

          // 2. Compare against individual words
          for (const word of strVal.split(/\s+/)) {
            const wordDist = calculateLevenshteinDistance(
              term,
              word.substring(0, term.length + 2),
            );
            if (wordDist < minDistance) {
              minDistance = wordDist;
            }
          }
        }
      }

      return { item, distance: minDistance };
    })
    .filter((res) => res.distance <= 3); // Allow max 3 typos

  if (fuzzyResults.length > 0) {
    fuzzyResults.sort((a, b) => a.distance - b.distance);
    return {
      results: fuzzyResults.slice(0, 5).map((r) => r.item),
      isFuzzyFallback: true,
    };
  }

  return { results: [], isFuzzyFallback: false };
}
