import type { IntentDefinition } from "./types";

export type MatchOutcome =
  | { kind: "match"; intent: IntentDefinition; captures: Record<string, string> }
  | { kind: "ambiguous"; candidates: IntentDefinition[] }
  | { kind: "none" };

const MATCH_THRESHOLD = 3;
const PHRASE_SCORE = 3;
const KEYWORD_SCORE = 1;

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ScoredIntent {
  score: number;
  captures: Record<string, string>;
}

function scoreIntent(normalized: string, intent: IntentDefinition): ScoredIntent {
  let score = 0;
  let captures: Record<string, string> = {};

  for (const phrase of intent.phrases) {
    const match = normalized.match(phrase);
    if (match) {
      score += PHRASE_SCORE;
      if (match.groups) {
        const present = Object.entries(match.groups).filter(([, value]) => value);
        captures = { ...Object.fromEntries(present), ...captures };
      }
    }
  }

  for (const keyword of intent.keywords) {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`);
    if (pattern.test(normalized)) score += KEYWORD_SCORE;
  }

  return { score, captures };
}

export function matchIntent(normalized: string, intents: IntentDefinition[]): MatchOutcome {
  const scored = intents
    .map((intent) => ({ intent, ...scoreIntent(normalized, intent) }))
    .filter((entry) => entry.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };

  const topScore = scored[0].score;
  const topEntries = scored.filter((entry) => entry.score === topScore);

  if (topEntries.length > 1) {
    return { kind: "ambiguous", candidates: topEntries.map((entry) => entry.intent) };
  }

  return { kind: "match", intent: topEntries[0].intent, captures: topEntries[0].captures };
}
