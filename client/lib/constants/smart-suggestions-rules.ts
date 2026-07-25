export interface SuggestionRule {
  triggerCategory?: string;
  triggerKeywords?: string[];
  suggestedCategories?: string[];
  suggestedNames?: string[];
}

/**
 * Symptom/condition clusters: categories customers commonly buy together for the
 * same ailment episode (e.g. malaria + typhoid are frequently treated together,
 * plus fever and immune support). Unlike SMART_SUGGESTIONS_RULES (one-directional
 * "trigger X, suggest Y"), every category in a cluster suggests every other
 * category in the same cluster — buying any one of them surfaces the rest.
 */
export const SMART_SUGGESTIONS_CLUSTERS: string[][] = [
  // Fever / malaria-typhoid episode
  ["Antimalarials", "Antityphoids", "Antipyretics", "Vitamins & Supplements"],
  // Cough, cold, flu, respiratory
  ["Cough & Cold", "Respiratory", "Antihistamines", "Vitamins & Supplements"],
  // Pain & inflammation
  ["Analgesics", "Antipyretics", "Vitamins & Supplements"],
  // Digestive complaints
  ["Antacids", "Digestives", "Probiotics"],
  // Wound care / first aid
  ["First Aid", "Antiseptics", "Vitamins & Supplements"],
  // Skin conditions
  ["Dermatologicals", "Skin Care", "Antifungals"],
  // Chronic disease management (often co-managed)
  ["Antidiabetics", "Cardiovascular", "Vitamins & Supplements"],
  // Reproductive / sexual health
  ["Family Planning", "Sexual Health"],
];

export const SMART_SUGGESTIONS_RULES: SuggestionRule[] = [
  // ==========================================
  // PHARMACY / CLINICAL RULES
  // ==========================================
  {
    triggerCategory: "Analgesics",
    triggerKeywords: ["pain relief", "painkiller"],
    suggestedCategories: ["Antacids", "Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Antimalarials",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements", "Analgesics", "Antipyretics"]
  },
  {
    triggerCategory: "Antityphoids",
    triggerKeywords: ["typhoid"],
    suggestedCategories: ["Antimalarials", "Antipyretics", "Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Antibiotics",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements", "Probiotics"]
  },
  {
    triggerCategory: "Antipyretics",
    triggerKeywords: ["fever", "paracetamol", "panadol"],
    suggestedCategories: ["Analgesics", "Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Cough & Cold",
    triggerKeywords: ["cough syrup", "cold and flu"],
    suggestedCategories: ["Vitamins", "Vitamins & Supplements", "Lozenges"]
  },
  {
    triggerCategory: "Respiratory",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements", "Lozenges"]
  },
  {
    triggerCategory: "Antihistamines",
    triggerKeywords: ["allergy", "antiallergic"],
    suggestedCategories: ["Nasal Sprays", "Eye Care", "Eye Drops"]
  },
  {
    triggerCategory: "Antacids",
    triggerKeywords: ["indigestion", "acidity"],
    suggestedCategories: ["Probiotics", "Analgesics"]
  },
  {
    triggerCategory: "Digestives",
    suggestedCategories: ["Probiotics", "Antacids"]
  },
  {
    triggerCategory: "Antidiabetics",
    triggerKeywords: ["diabetes", "insulin", "glucometer"],
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"],
    suggestedNames: ["Glucometer Strips", "Test Strips"]
  },
  {
    triggerCategory: "Cardiovascular",
    triggerKeywords: ["hypertension", "blood pressure"],
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Dermatologicals",
    triggerKeywords: ["skin cream", "ointment"],
    suggestedCategories: ["Skin Care", "Sunscreen"],
    suggestedNames: ["Moisturizer", "Sunscreen"]
  },
  {
    triggerCategory: "Eye Care",
    triggerKeywords: ["eye drop"],
    suggestedNames: ["Eye Wash", "Reading Glasses"]
  },
  {
    triggerCategory: "Ear Care",
    triggerKeywords: ["ear drop"],
    suggestedNames: ["Cotton Buds"]
  },
  {
    triggerCategory: "Vitamins",
    suggestedCategories: ["Vitamins & Supplements", "Probiotics"]
  },
  {
    triggerCategory: "Vitamins & Supplements",
    suggestedCategories: ["Vitamins", "Probiotics"]
  },
  {
    triggerCategory: "Family Planning",
    triggerKeywords: ["contraceptive", "condom"],
    suggestedNames: ["Lubricant Gel"]
  },
  {
    triggerCategory: "First Aid",
    triggerKeywords: ["wound care", "bandage", "plaster"],
    suggestedNames: ["Antiseptic", "Cotton Wool", "Bandage"]
  },
  {
    triggerCategory: "Antiseptics",
    suggestedNames: ["Cotton Wool", "Bandage", "Wound Dressing"]
  },
  {
    triggerCategory: "Sexual Health",
    suggestedNames: ["Lubricant Gel"],
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Oral Care",
    triggerKeywords: ["dental"],
    suggestedNames: ["Mouthwash", "Dental Floss"]
  },
  {
    triggerCategory: "Antifungals",
    triggerKeywords: ["fungal", "athlete's foot"],
    suggestedNames: ["Foot Powder", "Antiseptic"]
  },
  {
    triggerCategory: "Antivirals",
    suggestedCategories: ["Vitamins", "Vitamins & Supplements"]
  },
  {
    triggerCategory: "Baby Products",
    suggestedNames: ["Baby Wipes", "Baby Oil", "Molfix Diapers", "Pampers", "Baby Powder"]
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
    triggerKeywords: ["diaper", "pampers", "molfix"],
    suggestedNames: ["Baby Wipes", "Baby Oil", "Baby Powder"]
  },
  {
    triggerKeywords: ["soap", "bathing soap", "dettol"],
    suggestedNames: ["Sponge", "Body Lotion", "Vaseline"]
  },
  {
    triggerCategory: "Grains & Staples",
    triggerKeywords: ["rice", "beans", "garri", "semovita"],
    suggestedNames: ["Cooking Oil", "Seasoning Cubes", "Salt"]
  },
  {
    triggerCategory: "Beverages",
    triggerKeywords: ["soft drink", "malt", "juice"],
    suggestedNames: ["Biscuits", "Snacks", "Chin Chin"]
  },
  {
    triggerCategory: "Cleaning Supplies",
    triggerKeywords: ["detergent", "bleach", "disinfectant"],
    suggestedNames: ["Air Freshener", "Hand Gloves", "Sponge"]
  },
  {
    triggerCategory: "Cosmetics",
    triggerKeywords: ["makeup", "cosmetic"],
    suggestedNames: ["Cotton Pads", "Makeup Remover"]
  },
  {
    triggerCategory: "Phone Accessories",
    triggerKeywords: ["phone charger", "earpiece", "earphone"],
    suggestedNames: ["Screen Protector", "Power Bank", "Phone Case"]
  },
  {
    triggerCategory: "Stationery",
    triggerKeywords: ["notebook", "exercise book"],
    suggestedNames: ["Pen", "Pencil", "Ruler"]
  }
];
