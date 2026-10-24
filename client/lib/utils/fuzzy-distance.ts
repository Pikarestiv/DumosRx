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

// Levenshtein distance, skipped entirely when the two lengths are already further apart than the caller can accept.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-search-ts-L40
export function boundedLevenshteinDistance(
  a: string,
  b: string,
  maxDistance: number,
): number {
  if (Math.abs(a.length - b.length) > maxDistance) return Infinity;
  return calculateLevenshteinDistance(a, b);
}

// Minimum term length before the fuzzy (typo-tolerant) fallback fires at all.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-search-ts-L56
export const MIN_FUZZY_TERM_LENGTH = 4;

// Allowed Levenshtein distance scales with term length instead of a flat 3 for every term:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-search-ts-L68
export function maxFuzzyDistanceFor(termLength: number): number {
  if (termLength <= 5) return 1;
  if (termLength <= 8) return 2;
  return 3;
}
