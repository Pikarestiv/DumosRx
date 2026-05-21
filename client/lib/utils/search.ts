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
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

export interface SearchMedicineResult<T> {
  results: T[];
  isFuzzyFallback: boolean;
}

export function searchMedicines<T extends { name: string; generic_name?: string | null; brand?: string | null; barcode?: string | null }>(
  searchTerm: string,
  medicines: T[]
): SearchMedicineResult<T> {
  const term = searchTerm.trim().toLowerCase();
  
  if (!term) {
    return { results: medicines, isFuzzyFallback: false };
  }

  const tokens = term.split(/\s+/).filter(Boolean);

  // 1. Initial Strict Search (Tiers 1-3)
  const scoredResults = medicines.map((med) => {
    const name = med.name.toLowerCase();
    const generic = (med.generic_name || "").toLowerCase();
    const brand = (med.brand || "").toLowerCase();
    const barcode = (med.barcode || "").toLowerCase();
    
    let score = 0;

    // Tier 1: Exact Match
    if (name === term || barcode === term || brand === term || generic === term) {
      score += 100;
    }
    
    // Tier 2: Starts With
    if (name.startsWith(term) || generic.startsWith(term) || brand.startsWith(term)) {
      score += 50;
    }

    // Tier 3: Multi-word Token Match
    if (tokens.length > 0) {
      const allTokensMatch = tokens.every(token => 
        name.includes(token) || generic.includes(token) || brand.includes(token) || barcode.includes(token)
      );
      if (allTokensMatch) {
        score += 20;
      }
    }

    return { med, score };
  }).filter(item => item.score > 0);

  if (scoredResults.length > 0) {
    // Sort by score descending, then alphabetically by name
    scoredResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.med.name.localeCompare(b.med.name);
    });
    
    return {
      results: scoredResults.map(r => r.med),
      isFuzzyFallback: false
    };
  }

  // 4. Tier 4: Fuzzy Fallback (Only if no strict results and term is long enough)
  if (term.length < 3) {
    return { results: [], isFuzzyFallback: false };
  }

  const fuzzyResults = medicines.map((med) => {
    const name = med.name.toLowerCase();
    // Compare first word or full name with term to find distance
    const distName = calculateLevenshteinDistance(term, name.substring(0, term.length + 2));
    const distGeneric = med.generic_name ? calculateLevenshteinDistance(term, med.generic_name.toLowerCase().substring(0, term.length + 2)) : 999;
    const distBrand = med.brand ? calculateLevenshteinDistance(term, med.brand.toLowerCase().substring(0, term.length + 2)) : 999;
    
    const minDistance = Math.min(distName, distGeneric, distBrand);
    
    return { med, distance: minDistance };
  }).filter(item => item.distance <= 3); // Allow max 3 typos

  if (fuzzyResults.length > 0) {
    fuzzyResults.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.med.name.localeCompare(b.med.name);
    });
    
    // Return top 5 fuzzy suggestions
    return {
      results: fuzzyResults.slice(0, 5).map(r => r.med),
      isFuzzyFallback: true
    };
  }

  return { results: [], isFuzzyFallback: false };
}
