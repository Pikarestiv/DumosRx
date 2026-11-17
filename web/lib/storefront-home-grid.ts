type Breakpoint = "base" | "lg" | "xl";
type PerBreakpoint<T> = Record<Breakpoint, T>;

export type GridCapacity = PerBreakpoint<number>;

export const PRODUCT_GRID_CAPACITY: GridCapacity = { base: 8, lg: 8, xl: 10 };
export const SERVICE_GRID_CAPACITY: GridCapacity = { base: 6, lg: 8, xl: 10 };

export interface HomeGridLayout {
  shownCount: number;
  itemClasses: string[];
  moreTile: { className: string; counts: { value: number; className: string }[] } | null;
}

const BREAKPOINTS: Breakpoint[] = ["base", "lg", "xl"];

export function visibilityClasses(visible: PerBreakpoint<boolean>): string {
  const parts = [visible.base ? "block" : "hidden"];
  if (visible.lg !== visible.base) parts.push(visible.lg ? "lg:block" : "lg:hidden");
  if (visible.xl !== visible.lg) parts.push(visible.xl ? "xl:block" : "xl:hidden");
  return parts.join(" ");
}

const perBreakpoint = <T,>(pick: (bp: Breakpoint) => T): PerBreakpoint<T> => ({ base: pick("base"), lg: pick("lg"), xl: pick("xl") });

export function homeGridLayout(total: number, available: number, capacity: GridCapacity): HomeGridLayout {
  const overflows = perBreakpoint((bp) => total > capacity[bp]);
  const shown = perBreakpoint((bp) => Math.min(available, overflows[bp] ? capacity[bp] - 1 : total));
  const more = perBreakpoint((bp) => (overflows[bp] ? total - shown[bp] : 0));
  const shownCount = Math.max(...BREAKPOINTS.map((bp) => shown[bp]));

  const itemClasses = Array.from({ length: shownCount }, (_, index) => visibilityClasses(perBreakpoint((bp) => index < shown[bp])));
  const distinctCounts = [...new Set(BREAKPOINTS.map((bp) => more[bp]).filter((count) => count > 0))];
  const moreTile = distinctCounts.length
    ? {
        className: visibilityClasses(perBreakpoint((bp) => more[bp] > 0)),
        counts: distinctCounts.map((value) => ({ value, className: visibilityClasses(perBreakpoint((bp) => more[bp] === value)) })),
      }
    : null;

  return { shownCount, itemClasses, moreTile };
}
