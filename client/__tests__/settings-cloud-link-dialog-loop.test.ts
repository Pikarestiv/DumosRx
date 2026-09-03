import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for a bug found while smoke-testing Settings > Data/Cloud
// (docs/features/settings.md's "Data" section, cross-referenced against
// Task 0's sync-queue fix): on a store that isn't cloud-linked,
// /settings/cloud (the URL alias for the Data tab, see TAB_ALIASES in
// hooks/use-settings.ts) opens the "Link DumosRx Cloud" dialog, but the
// dialog could never actually be dismissed — closing it (Escape or the
// Close button) immediately reopened it on the very next render.
//
// Root cause: the effect that resolves tabParam -> internalTab and opens
// the dialog depends on the whole `syncState` object returned by
// useSettingsSync(isCloudLinked, refetchStore) - a plain object literal
// recreated on every render, so it never has a stable identity. With
// `syncState` in the dependency array, the effect reruns on every render of
// useSettings(), and unconditionally calls syncState.setIsCloudLinkOpen(true)
// whenever internalTab === "cloud" && !isCloudLinked - which stays true for
// as long as the user remains on that route, regardless of whether they
// just manually closed the dialog. Live-reproduced: navigating to
// /settings/cloud on a non-cloud-linked store, the dialog reappeared
// immediately after every dismissal attempt.
//
// This test parses the hook's source (no component-rendering harness exists
// in this repo yet - see dashboard-action-center-routes.test.ts /
// profit-loss-tab-currency-formatting.test.ts for the same source-inspection
// pattern) and asserts the effect depends on the specific, referentially
// stable setter (syncState.setIsCloudLinkOpen, which useState guarantees is
// stable across renders) rather than the whole unstable syncState object.

describe('useSettings: cloud-link dialog effect dependencies', () => {
  it('does not depend on the whole (unstable) syncState object', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../hooks/use-settings.ts'),
      'utf-8',
    );

    const effectMatch = source.match(
      /useEffect\(\(\) => \{[\s\S]*?syncState\.setIsCloudLinkOpen\(true\);[\s\S]*?\}, \[([^\]]*)\]\);/,
    );
    expect(effectMatch, 'expected to find the tab-resolution effect that calls syncState.setIsCloudLinkOpen').not.toBeNull();

    const depsList = effectMatch![1];

    // The bug: a bare `syncState` dependency - a fresh object every render -
    // makes this effect (and its unconditional dialog-open call) rerun on
    // every render for as long as the route stays on the cloud alias.
    expect(depsList).not.toMatch(/(^|,)\s*syncState\s*(,|$)/);

    // The fix: depend on the specific stable setter this effect actually
    // calls, so it only reruns when tabParam/isCloudLinked/isAdmin/activeTab
    // genuinely change.
    expect(depsList).toMatch(/syncState\.setIsCloudLinkOpen/);
  });
});
