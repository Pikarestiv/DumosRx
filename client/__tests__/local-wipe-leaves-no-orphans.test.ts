import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A-274. `resetDatabase()` clears `_sync_queue` but only `LOCAL_WIPE_TABLES`, so any store-scoped table missing from that…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-local-wipe-leaves-no-orphans-test-ts-L5
describe("a local wipe that clears _sync_queue cannot orphan a synced table", () => {
  const read = (p: string) =>
    fs.readFileSync(path.resolve(__dirname, "..", p), "utf-8");

  function arrayLiteral(source: string, name: string): string[] {
    const start = source.indexOf(name);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const open = source.indexOf("[", start);
    const close = source.indexOf("];", open);
    return [...source.slice(open, close).matchAll(/"([a-zA-Z0-9_]+)"/g)].map(
      (m) => m[1],
    );
  }

  it("LOCAL_WIPE_TABLES covers every store-scoped table", () => {
    const wipe = arrayLiteral(read("lib/db/core.ts"), "LOCAL_WIPE_TABLES");
    const scoped = arrayLiteral(
      read("lib/db/schema-migrations.ts"),
      "STORE_SCOPED_TABLES",
    );

    expect(wipe).toContain("_sync_queue");
    expect(scoped.length).toBeGreaterThan(20);

    const orphanable = scoped.filter((t) => !wipe.includes(t));
    expect(orphanable).toEqual([]);
  });
});
