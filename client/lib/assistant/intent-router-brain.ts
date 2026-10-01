import type { AssistantBrain, BrainOutcome, ToolContext } from "./types";
import { normalizeUtterance } from "./normalize";
import { matchIntent } from "./intent-matcher";
import { INTENTS } from "./intents";

export class IntentRouterBrain implements AssistantBrain {
  resolve(utterance: string, ctx: ToolContext): BrainOutcome {
    const { normalized } = normalizeUtterance(utterance);
    const result = matchIntent(normalized, INTENTS);

    if (result.kind === "none") return { kind: "none" };

    if (result.kind === "ambiguous") {
      return {
        kind: "ambiguous",
        candidates: result.candidates.map((intent) => ({ tool: intent.tool, label: intent.label })),
      };
    }

    return {
      kind: "call",
      call: { tool: result.intent.tool, args: result.intent.buildArgs(result.captures, normalized, ctx) },
    };
  }
}

export const intentRouterBrain = new IntentRouterBrain();
