import {
  boundedLevenshteinDistance,
  MIN_FUZZY_TERM_LENGTH,
  maxFuzzyDistanceFor,
} from "./fuzzy-distance";

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
  if (term.length < MIN_FUZZY_TERM_LENGTH) {
    return { results: [], isFuzzyFallback: false };
  }

  const maxDistance = maxFuzzyDistanceFor(term.length);

  const fuzzyResults = items
    .map((item) => {
      let minDistance = 999;

      for (const key of searchKeys) {
        const val = item[key];
        if (val) {
          const strVal = String(val).toLowerCase();
          // 1. Compare with substring of similar length to term
          const dist = boundedLevenshteinDistance(
            term,
            strVal.substring(0, term.length + 2),
            maxDistance,
          );
          if (dist < minDistance) {
            minDistance = dist;
          }

          // 2. Compare against individual words
          for (const word of strVal.split(/\s+/)) {
            const wordDist = boundedLevenshteinDistance(
              term,
              word.substring(0, term.length + 2),
              maxDistance,
            );
            if (wordDist < minDistance) {
              minDistance = wordDist;
            }
          }
        }
      }

      return { item, distance: minDistance };
    })
    .filter((res) => res.distance <= maxDistance);

  if (fuzzyResults.length > 0) {
    fuzzyResults.sort((a, b) => a.distance - b.distance);
    return {
      results: fuzzyResults.slice(0, 5).map((r) => r.item),
      isFuzzyFallback: true,
    };
  }

  return { results: [], isFuzzyFallback: false };
}
