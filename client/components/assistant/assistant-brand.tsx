export const ASSISTANT_NAME = "DumoAI";

const TAG_CLASS =
  "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none tracking-wide";

const TAG_TONE = {
  onPrimary: "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground",
  onSurface: "border-primary/40 bg-primary/10 text-primary",
} as const;

export function AssistantBetaTag({ tone = "onSurface" }: { tone?: keyof typeof TAG_TONE }) {
  return <span className={`${TAG_CLASS} ${TAG_TONE[tone]}`}>Beta</span>;
}
