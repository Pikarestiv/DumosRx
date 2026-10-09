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
// The effect now lives in hooks/use-settings-tab-resolution.ts, extracted when
// use-settings.ts hit the 350-line limit. The guarantee is unchanged and is
// now checked on both sides of the boundary: the extracted effect must depend
// on its stable `openCloudLink` prop, and use-settings.ts must pass the stable
// setter rather than the whole syncState object.
//
// This test parses the hook's source (no component-rendering harness exists
// in this repo yet - see dashboard-action-center-routes.test.ts /
// profit-loss-tab-currency-formatting.test.ts for the same source-inspection
// pattern) and asserts the effect depends on the specific, referentially
// stable setter (syncState.setIsCloudLinkOpen, which useState guarantees is
// stable across renders) rather than the whole unstable syncState object.

describe('useSettings: cloud-link dialog effect dependencies', () => {
  it('does not depend on the whole (unstable) syncState object', () => {
    const resolution = fs.readFileSync(
      path.join(__dirname, '../hooks/use-settings-tab-resolution.ts'),
      'utf-8',
    );

    const effectMatch = resolution.match(
      /useEffect\(\(\) => \{[\s\S]*?openCloudLink\(true\);[\s\S]*?\}, \[([^\]]*)\]\);/,
    );
    expect(effectMatch, 'expected to find the tab-resolution effect that opens the cloud-link dialog').not.toBeNull();

    const depsList = effectMatch![1];

    // The caller must hand over the referentially stable useState setter, not
    // the whole object literal useSettingsSync() rebuilds every render.
    const caller = fs.readFileSync(
      path.join(__dirname, '../hooks/use-settings.ts'),
      'utf-8',
    );
    expect(caller).toMatch(/openCloudLink:\s*syncState\.setIsCloudLinkOpen/);
    expect(caller).not.toMatch(/openCloudLink:\s*syncState\s*[,}]/);

    // `hasKey` feeds canAccessTab, which the effect depends on. Passing an
    // inline closure recreates it every render and reinstates the loop by a
    // different route — which is exactly what happened when the effect was
    // extracted into use-settings-tab-resolution.ts.
    expect(caller, 'hasKey must be memoised or canAccessTab is unstable').toMatch(
      /const hasKey = useCallback\(/,
    );
    expect(caller).not.toMatch(/hasKey:\s*\(key/);

    // The bug: a bare `syncState` dependency - a fresh object every render -
    // makes this effect (and its unconditional dialog-open call) rerun on
    // every render for as long as the route stays on the cloud alias.
    expect(depsList).not.toMatch(/(^|,)\s*syncState\s*(,|$)/);

    // The fix: depend on the specific stable setter this effect actually
    // calls, so it only reruns when tabParam/isCloudLinked/isAdmin/activeTab
    // genuinely change.
    expect(depsList).toMatch(/openCloudLink/);
  });
});
