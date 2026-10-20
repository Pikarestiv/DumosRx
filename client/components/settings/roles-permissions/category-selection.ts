// Tri-state maths for the Roles & Permissions matrix's category rows.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-roles-permissions-category-selection-ts-L1

export type CategoryCheckState = "checked" | "unchecked" | "indeterminate";

export function getCategoryCheckState(categoryKeys: string[], grantedKeys: readonly string[]): CategoryCheckState {
  if (categoryKeys.length === 0) return "unchecked";
  const granted = new Set(grantedKeys);
  const hits = categoryKeys.filter((key) => granted.has(key)).length;
  if (hits === 0) return "unchecked";
  return hits === categoryKeys.length ? "checked" : "indeterminate";
}

// Clicking a fully-checked category clears it; clicking an unchecked OR partially-checked one fills it in.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-roles-permissions-category-selection-ts-L15
export function getCategoryToggleTarget(state: CategoryCheckState): boolean {
  return state !== "checked";
}

// The keys a category click should actually write.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-roles-permissions-category-selection-ts-L23
export function getCategoryToggleKeys(categoryKeys: string[], lockedKeys: readonly string[]): string[] {
  const locked = new Set(lockedKeys);
  return categoryKeys.filter((key) => !locked.has(key));
}
