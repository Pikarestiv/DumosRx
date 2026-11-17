import { Check } from "lucide-react";
import type { PurchaseOrder } from "@/lib/db/procurement";

type StepState = "done" | "current" | "upcoming";

function Step({ label, state }: { label: string; state: StepState }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-primary text-primary-foreground"
            : state === "current"
              ? "border-2 border-primary"
              : "border-2 border-border"
        }`}
      >
        {state === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        {state === "current" && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </div>
      <span
        className={`text-center text-[13px] ${
          state === "upcoming" ? "text-muted-foreground" : "font-semibold text-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return <div className={`mt-[11px] h-0.5 flex-1 ${filled ? "bg-primary" : "bg-border"}`} />;
}

function stepsFor(po: PurchaseOrder): { label: string; state: StepState }[] {
  const received = po.status === "received";
  const partial = po.status === "partially_received";
  const sent = po.status === "sent";
  const steps: { label: string; state: StepState }[] = [
    { label: "Draft", state: sent || partial || received ? "done" : "current" },
  ];
  if (po.type !== "immediate") {
    steps.push({ label: "Sent", state: partial || received ? "done" : sent ? "current" : "upcoming" });
  }
  steps.push({
    label: partial ? "Partially received" : "Received",
    state: received ? "done" : partial ? "current" : "upcoming",
  });
  return steps;
}

export function PoStatusTimeline({ po }: { po: PurchaseOrder }) {
  const steps = stepsFor(po);
  return (
    <section>
      <h4 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Order Status
      </h4>
      <div className="flex items-start">
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-1 items-start first:flex-none">
            {index > 0 && <Connector filled={steps[index - 1].state === "done"} />}
            <Step label={step.label} state={step.state} />
          </div>
        ))}
      </div>
    </section>
  );
}
