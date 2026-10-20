import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for a bug found while smoke-testing Settings > Data/Cloud (docs/features/settings.md's "Data" section, c…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-settings-cloud-link-dialog-loop-test-ts-L5

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

    // `hasKey` feeds canAccessTab, which the effect depends on.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-settings-cloud-link-dialog-loop-test-ts-L61
    expect(caller, 'hasKey must be memoised or canAccessTab is unstable').toMatch(
      /const hasKey = useCallback\(/,
    );
    expect(caller).not.toMatch(/hasKey:\s*\(key/);

    // The bug: a bare `syncState` dependency - a fresh object every render - makes this effect (and its unconditional dialog-o…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-settings-cloud-link-dialog-loop-test-ts-L70
    expect(depsList).not.toMatch(/(^|,)\s*syncState\s*(,|$)/);

    // The fix: depend on the specific stable setter this effect actually calls, so it only reruns when tabParam/isCloudLinked/…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-settings-cloud-link-dialog-loop-test-ts-L75
    expect(depsList).toMatch(/openCloudLink/);
  });
});
