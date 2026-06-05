export interface SuggestionRule {
  triggerCategory?: string;
  triggerKeywords?: string[];
  suggestedCategories?: string[];
  suggestedNames?: string[];
}

export const SMART_SUGGESTIONS_RULES: SuggestionRule[] = [
  // ==========================================
  // CLINICAL STORE RULES
  // ==========================================
  {
    triggerCategory: "Antimalarials",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements", "Analgesics"]
  },
  {
    triggerCategory: "Antibiotics",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Cough & Cold",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Analgesics",
    suggestedCategories: ["Antacids"]
  },

  // ==========================================
  // GENERAL GROCERY & RETAIL RULES
  // ==========================================
  {
    triggerKeywords: ["bread", "sliced bread", "loaf"],
    suggestedNames: ["Lipton tea", "Milo", "Blue Band", "Butter", "Milk"]
  },
  {
    triggerKeywords: ["toothbrush", "tooth brush", "toothpaste", "tooth paste"],
    suggestedNames: ["Colgate", "Close Up", "Listerine", "Dental Floss", "Toothpaste", "Mouthwash"]
  },
  {
    triggerCategory: "Baby Products",
    suggestedNames: ["Baby Wipes", "Baby Oil", "Molfix Diapers", "Pampers"]
  },
  {
    triggerKeywords: ["diaper", "pampers", "molfix"],
    suggestedNames: ["Baby Wipes", "Baby Oil", "Baby Powder"]
  },
  {
    triggerKeywords: ["soap", "bathing soap", "dettol"],
    suggestedNames: ["Sponge", "Body Lotion", "Vaseline"]
  }
];
