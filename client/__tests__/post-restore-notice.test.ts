import { describe, it, expect, beforeEach } from "vitest";
import {
  markRestoredForCloudLinkNotice,
  consumePostRestoreCloudLinkNotice,
} from "@/lib/utils/post-restore-notice";

/**
 * Regression tests for known bug #10, Part B (docs/features/_known-bugs.md):
 * restoreDatabase() never touches the cloud auth token, so a device
 * recovered from a local backup silently loses its cloud link. The fix is a
 * one-time, restore-specific notice (not a persistent nag - the dashboard
 * header's SyncIndicator already covers "always unlinked") gated on a
 * short-lived sessionStorage marker set right before the post-restore
 * reload.
 */
describe("post-restore cloud-link notice", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("fires when the device is not cloud-linked right after a restore-flagged reload", () => {
    markRestoredForCloudLinkNotice();
    expect(consumePostRestoreCloudLinkNotice(false)).toBe(true);
  });

  it("does not fire on a normal subsequent page load (no restore flag set)", () => {
    expect(consumePostRestoreCloudLinkNotice(false)).toBe(false);
  });

  it("does not fire at all if the device is cloud-linked after the restore", () => {
    markRestoredForCloudLinkNotice();
    expect(consumePostRestoreCloudLinkNotice(true)).toBe(false);
  });

  it("only fires once per restore, even if checked again on a later load", () => {
    markRestoredForCloudLinkNotice();
    expect(consumePostRestoreCloudLinkNotice(false)).toBe(true);
    // Marker was consumed by the first check; a second check (e.g. another
    // mounted component, or the user navigating around) must not re-fire.
    expect(consumePostRestoreCloudLinkNotice(false)).toBe(false);
  });

  it("consumes (clears) the marker even when the device is linked, so a later unrelated unlink doesn't retroactively fire it", () => {
    markRestoredForCloudLinkNotice();
    expect(consumePostRestoreCloudLinkNotice(true)).toBe(false);
    expect(consumePostRestoreCloudLinkNotice(false)).toBe(false);
  });
});
