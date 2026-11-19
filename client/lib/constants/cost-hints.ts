export const AVG_COST_HINT =
  "Average cost of the batches currently in stock, weighted by quantity. Each delivery is its own batch with its own cost, so this blends them. A sale is costed at the batch it sells from (earliest expiry first), not at this average.";

export const CURRENT_COST_HINT =
  `${AVG_COST_HINT} Shown for comparison only, not editable here.`;
