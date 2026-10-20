import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A-304. A sync run used to resolve its store twice — `client.ts` stamped `X-Store-Id` from localStorage at request time w…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-engine-store-identity-test-ts-L5
const ENGINE_DIR = join(__dirname, "..", "lib", "db", "sync-engine");

// What this guard covers:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-engine-store-identity-test-ts-L19
const MAY_READ_AMBIENT_STORE = new Set([
  "sync-run.ts",
  "stock-integrity.ts",
  "health-check.ts",
  "reconcile-quantities.ts",
  "device-report-command.ts",
  "stock-auto-heal.ts",
]);

describe("the sync engine takes its store from the run, not from ambient state", () => {
  it("has exactly one file that reads the ambient active store", () => {
    const offenders = readdirSync(ENGINE_DIR)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !MAY_READ_AMBIENT_STORE.has(file))
      .filter((file) => {
        const source = readFileSync(join(ENGINE_DIR, file), "utf8");
        return (
          source.includes("getActiveStoreId") ||
          source.includes("getStoredActiveStoreId")
        );
      });

    expect(offenders).toEqual([]);
  });
});
