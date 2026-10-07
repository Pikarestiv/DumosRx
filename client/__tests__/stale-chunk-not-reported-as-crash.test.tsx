import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const logCrashMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/utils/error-logger", () => ({
  logCrash: (...args: unknown[]) => logCrashMock(...args),
}));

/**
 * A-171's real cause, found in review. `DUMOSRX-CLIENT-F` — 260 fatal events,
 * no stacktrace, no `area` — is the stale-chunk SyntaxError that
 * `chunk-error.ts` already recognises: a static-export host serves
 * `index.html` for a missing chunk and the browser executes HTML as script.
 *
 * The app already self-heals it with a one-time reload. The defect was
 * ordering: `logCrash(..., true)` ran BEFORE `reloadOnChunkError`, so every
 * recoverable stale chunk was first reported as a fatal crash.
 *
 * A chunk error that survives the reload is a different matter and must
 * still be reported — that is what the reload guard distinguishes.
 */
describe("GlobalErrorListener and stale chunks", () => {
  let GlobalErrorListener: typeof import("@/components/tauri/global-error-listener").GlobalErrorListener;
  const reloadSpy = vi.fn();

  beforeEach(async () => {
    ({ GlobalErrorListener } = await import("@/components/tauri/global-error-listener"));
    logCrashMock.mockClear();
    reloadSpy.mockClear();
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  const fireError = (message: string) => {
    const error = new Error(message);
    window.dispatchEvent(new ErrorEvent("error", { error, message }));
  };

  it("reloads a stale chunk without reporting it as a fatal crash", () => {
    render(<GlobalErrorListener><div /></GlobalErrorListener>);

    fireError("Unexpected token '<'");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(logCrashMock).not.toHaveBeenCalled();
  });

  /** If the reload already happened and it is still broken, that is real. */
  it("reports a chunk error that survived the one-time reload", () => {
    render(<GlobalErrorListener><div /></GlobalErrorListener>);
    fireError("Unexpected token '<'");
    reloadSpy.mockClear();

    fireError("Unexpected token '<'");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(logCrashMock).toHaveBeenCalled();
  });

  /** A JSON parse failure is a backend problem, never a stale chunk. */
  it("still reports a JSON parse failure rather than reloading", () => {
    render(<GlobalErrorListener><div /></GlobalErrorListener>);

    fireError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(logCrashMock).toHaveBeenCalled();
  });

  it("still reports an ordinary crash", () => {
    render(<GlobalErrorListener><div /></GlobalErrorListener>);

    fireError("Cannot read properties of undefined (reading 'x')");

    expect(logCrashMock).toHaveBeenCalled();
  });
});
