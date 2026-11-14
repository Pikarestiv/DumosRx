export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--sf-ink)]";

export const DISPLAY_FONT = "[font-family:var(--sf-font-display)] [font-weight:var(--sf-display-weight)]";
export const PRICE_FONT = "[font-family:var(--sf-font-price)] [font-weight:var(--sf-price-weight)] tabular-nums";

const BUTTON_BASE =
  `inline-flex min-h-11 items-center justify-center gap-2 border px-6 text-sm font-semibold rounded-[var(--sf-button-radius)] transition-opacity ${FOCUS_RING}`;

export const PRIMARY_BUTTON = `${BUTTON_BASE} [background:var(--sf-button-bg)] [color:var(--sf-button-fg)] [border-color:var(--sf-button-border)] hover:opacity-90`;
export const SECONDARY_BUTTON = `${BUTTON_BASE} border-current/40 bg-transparent hover:border-current`;

export const ADD_BUTTON =
  `inline-flex h-11 w-11 shrink-0 items-center justify-center border rounded-[var(--sf-button-radius)] [background:var(--sf-add-bg)] [color:var(--sf-add-fg)] [border-color:var(--sf-add-border)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

export const CARD_SURFACE = "overflow-hidden border border-black/10 bg-white rounded-[var(--sf-card-radius)]";
