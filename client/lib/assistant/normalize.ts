import type { NormalizedUtterance } from "./types";

const DATE_SAFE_PUNCTUATION = /[^a-z0-9\s/-]/g;

export function normalizeUtterance(text: string): NormalizedUtterance {
  const lowered = text.toLowerCase();
  const stripped = lowered.replace(DATE_SAFE_PUNCTUATION, "");
  const normalized = stripped.replace(/\s+/g, " ").trim();
  const tokens = normalized.length > 0 ? normalized.split(" ") : [];

  return { raw: text, normalized, tokens };
}
