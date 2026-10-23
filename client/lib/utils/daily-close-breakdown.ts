export const DAILY_CLOSE_PROFIT_LABEL = "Profit before expenses (Est.)";
export const DAILY_CLOSE_PROFIT_AFTER_EXPENSES_LABEL = "Profit after expenses (Est.)";

export interface BreakdownLine {
  label: string;
  /** Signed: a deduction is negative. */
  amount: number;
  /** Where the user can inspect this component. */
  href?: string;
}

/** A headline figure and the lines it is the sum of. `total` is computed from
 * `lines`, so the two cannot disagree. */
export interface FigureBreakdown {
  lines: BreakdownLine[];
  total: number;
}

const expensesForDayHref = (reportDate: string) => `/expenses?from=${reportDate}&to=${reportDate}`;

function fromLines(lines: BreakdownLine[]): FigureBreakdown {
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

export function buildNetCashBreakdown({
  cashSales,
  cashRefunds,
  cashExpenses,
  reportDate,
}: {
  cashSales: number;
  cashRefunds: number;
  cashExpenses: number;
  reportDate: string;
}): FigureBreakdown {
  return fromLines([
    { label: "Cash taken in sales", amount: cashSales },
    { label: "Cash refunded on returns", amount: -cashRefunds },
    { label: "Cash expenses paid out", amount: -cashExpenses, href: expensesForDayHref(reportDate) },
  ]);
}

export function buildProfitBreakdown({
  grossSales,
  refunds,
  tax,
  costOfGoods,
  resellerPayouts,
}: {
  grossSales: number;
  refunds: number;
  tax: number;
  costOfGoods: number;
  resellerPayouts: number;
}): FigureBreakdown {
  return fromLines([
    { label: "Sales", amount: grossSales },
    { label: "Refunds", amount: -refunds },
    { label: "VAT / tax collected (not yours to keep)", amount: -tax },
    { label: "Cost of goods sold, minus returned stock", amount: -costOfGoods },
    ...(resellerPayouts
      ? [{ label: "Reseller commission paid out", amount: -resellerPayouts }]
      : []),
  ]);
}

export function buildProfitAfterExpensesBreakdown({
  profitBreakdown,
  dayExpenses,
  reportDate,
}: {
  profitBreakdown: FigureBreakdown;
  dayExpenses: number;
  reportDate: string;
}): FigureBreakdown {
  return fromLines([
    ...profitBreakdown.lines,
    { label: "Expenses for this day", amount: -dayExpenses, href: expensesForDayHref(reportDate) },
  ]);
}
