/** Tri-state maths for the Roles & Permissions matrix's category rows.
 * Pure and framework-free so the "all / none / some" decision is testable
 * without a render harness - the component only wires it to a checkbox. */

export type CategoryCheckState = "checked" | "unchecked" | "indeterminate";

export function getCategoryCheckState(categoryKeys: string[], grantedKeys: readonly string[]): CategoryCheckState {
  if (categoryKeys.length === 0) return "unchecked";
  const granted = new Set(grantedKeys);
  const hits = categoryKeys.filter((key) => granted.has(key)).length;
  if (hits === 0) return "unchecked";
  return hits === categoryKeys.length ? "checked" : "indeterminate";
}

/** Clicking a fully-checked category clears it; clicking an unchecked OR
 * partially-checked one fills it in. That is the standard tri-state
 * behavior and it means one click always resolves the ambiguous middle
 * state into "everything on". */
export function getCategoryToggleTarget(state: CategoryCheckState): boolean {
  return state !== "checked";
}

/** The keys a category click should actually write. `lockedKeys` are cells
 * the matrix renders disabled (today: the acting user's own
 * manage_roles_permissions) - a category-level clear must not strip a
 * grant the per-cell UI refuses to strip, or the bulk control becomes a
 * way around the self-lockout guard. */
export function getCategoryToggleKeys(categoryKeys: string[], lockedKeys: readonly string[]): string[] {
  const locked = new Set(lockedKeys);
  return categoryKeys.filter((key) => !locked.has(key));
}
