export type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error";

interface AutosaveSchedulerOptions {
  save: () => Promise<void>;
  debounceMs: number;
  onState: (state: AutosaveState) => void;
}

export interface AutosaveScheduler {
  request: (mode: "now" | "debounced") => void;
  flush: () => Promise<void>;
  lastError: () => Error | null;
  dispose: () => void;
}

export function createAutosaveScheduler({ save, debounceMs, onState }: AutosaveSchedulerOptions): AutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let running: Promise<void> | null = null;
  let error: Error | null = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = (): Promise<void> => {
    clearTimer();
    if (running) return running;
    if (!dirty) return Promise.resolve();
    dirty = false;
    onState("saving");
    running = save()
      .then(() => {
        error = null;
        if (!dirty) onState("saved");
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err : new Error(String(err));
        dirty = true;
        onState("error");
      })
      .finally(() => {
        running = null;
        if (dirty && !error) void run();
      });
    return running;
  };

  return {
    request(mode) {
      dirty = true;
      if (error) error = null;
      onState("pending");
      if (mode === "now") {
        void run();
        return;
      }
      clearTimer();
      timer = setTimeout(() => void run(), debounceMs);
    },
    async flush() {
      while (running || (dirty && !error)) {
        await (running ?? run());
      }
    },
    lastError: () => error,
    dispose: clearTimer,
  };
}
