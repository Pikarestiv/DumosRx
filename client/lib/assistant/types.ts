export type StoreType = string;

export interface ToolContext {
  user: { id: string; role: string; store_id?: string | null } | null;
  permissionGroup: { permissions: string[] } | null;
  currencyCode?: string;
  expiryWarningDays: number;
  storeType: StoreType;
  t: (key: string) => string;
  now: Date;
}

export interface ReplyAction {
  label: string;
  href: string;
}

export interface AssistantReply {
  kind: "answer" | "help" | "fallback" | "denied" | "error";
  text: string;
  actions?: ReplyAction[];
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: ReplyAction[];
  at: string;
}

export interface AssistantTool<A = Record<string, unknown>, R = unknown> {
  name: string;
  description: string;
  parameters: Record<string, { type: "string" | "number"; description: string; required?: boolean }>;
  requiredPermission?: string | string[];
  examples: string[];
  execute: (args: A, ctx: ToolContext) => Promise<R>;
  format: (result: R, args: A, ctx: ToolContext) => AssistantReply;
}

export type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

export interface AmbiguousCandidate {
  tool: string;
  label: string;
}

export type BrainOutcome =
  | { kind: "call"; call: ToolCall }
  | { kind: "ambiguous"; candidates: AmbiguousCandidate[] }
  | { kind: "none" };

export interface AssistantBrain {
  resolve(utterance: string, ctx: ToolContext): BrainOutcome;
}

export interface IntentDefinition {
  id: string;
  tool: string;
  label: string;
  phrases: RegExp[];
  keywords: string[];
  buildArgs: (captures: Record<string, string>, utterance: string, ctx: ToolContext) => Record<string, unknown>;
}

export interface NormalizedUtterance {
  raw: string;
  normalized: string;
  tokens: string[];
}
