<?php

namespace Tests\Feature;

use App\Services\PermissionGroupSeeder;
use Tests\TestCase;

/**
 * The client (client/lib/constants/permissions.ts) is the source of truth
 * for the permission catalog and for what each default group is seeded
 * with; PermissionGroupSeeder.php is a hand-maintained port of it. The two
 * drifted for two days (the 2026-09-28 QuickBooks expansion and the
 * 2026-09-29 enforcement passes only ever edited the client), which left
 * any store seeded server-side stuck on the pre-expansion lists. This test
 * is the tripwire for that drift.
 *
 * It lives on the PHP side rather than in vitest because the Checks
 * workflow's `client` job installs Node but no PHP, while its `server` job
 * checks out the whole repo (client/ included) and has PHP - so this is the
 * only one of the two jobs where both artifacts exist.
 */
class PermissionCatalogParityTest extends TestCase
{
    private const ROLES = ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'];

    private static function clientConstantsSource(): string
    {
        $path = realpath(base_path('../client/lib/constants/permissions.ts'));
        static::assertNotFalse($path, 'client/lib/constants/permissions.ts not found');
        $source = file_get_contents($path);
        $source = preg_replace('#/\*[\s\S]*?\*/#', '', $source);

        return preg_replace('#//[^\n]*#', '', $source);
    }

    private static function blockAfter(string $source, string $name): string
    {
        $start = preg_match('/\b' . preg_quote($name, '/') . '\b[\s\S]*?=\s*[\[{]/', $source, $m, PREG_OFFSET_CAPTURE)
            ? $m[0][1] + strlen($m[0][0])
            : null;
        static::assertNotNull($start, "could not locate {$name} in the client constants");
        $end = preg_match('/\n\];|\n\};/', $source, $m2, PREG_OFFSET_CAPTURE, $start)
            ? $m2[0][1]
            : null;
        static::assertNotNull($end, "could not find the end of {$name} in the client constants");

        return substr($source, $start, $end - $start);
    }

    private static function rolesIn(string $block, array $catalogKeys): array
    {
        $offsets = [];
        foreach (self::ROLES as $role) {
            if (preg_match('/\b' . $role . '\s*:/', $block, $m, PREG_OFFSET_CAPTURE)) {
                $offsets[$role] = $m[0][1];
            }
        }
        asort($offsets);

        $parsed = [];
        $positions = array_values($offsets);
        $names = array_keys($offsets);
        foreach ($names as $i => $role) {
            $from = $positions[$i];
            $to = $positions[$i + 1] ?? strlen($block);
            $segment = substr($block, $from, $to - $from);
            preg_match_all('/"([a-z_]+)"/', $segment, $keys);
            $parsed[$role] = $keys[1];
            if (empty($keys[1]) && str_contains($segment, 'PERMISSION_CATALOG')) {
                $parsed[$role] = $catalogKeys;
            }
        }

        return $parsed;
    }

    /** @return array{0: string[], 1: array<string, string[]>, 2: array<int, array<string, string[]>>} */
    private static function parseClientConstants(): array
    {
        $source = self::clientConstantsSource();

        preg_match_all('/\{\s*key:\s*"([a-z_]+)"/', self::blockAfter($source, 'PERMISSION_CATALOG'), $m);
        $catalogKeys = $m[1];

        $defaults = self::rolesIn(self::blockAfter($source, 'DEFAULT_GROUP_PERMISSIONS'), $catalogKeys);

        $additionsBlock = self::blockAfter($source, 'DEFAULT_GROUP_PERMISSION_ADDITIONS');
        preg_match_all('/(\d+)\s*:\s*\{([\s\S]*?)\n  \},/', $additionsBlock, $versionMatches, PREG_SET_ORDER);
        $additions = [];
        foreach ($versionMatches as $match) {
            $additions[(int) $match[1]] = self::rolesIn($match[2], $catalogKeys);
        }

        return [$catalogKeys, $defaults, $additions];
    }

    public function test_the_typescript_parser_actually_parsed_something(): void
    {
        [$catalogKeys, $defaults, $additions] = self::parseClientConstants();

        $this->assertGreaterThanOrEqual(40, count($catalogKeys), 'parsed an implausibly small PERMISSION_CATALOG');
        $this->assertSame(self::ROLES, array_keys($defaults), 'parsed DEFAULT_GROUP_PERMISSIONS is missing a role');
        $this->assertNotEmpty($additions, 'parsed no catalog-version addition sets');
        $this->assertContains('process_sales', $defaults['sales_staff']);
    }

    public function test_the_php_seeder_defaults_match_the_client_catalog_key_for_key(): void
    {
        [$catalogKeys, $defaults] = self::parseClientConstants();
        $server = PermissionGroupSeeder::defaultGroupPermissions();

        $this->assertSame(self::ROLES, array_keys($server));

        foreach (self::ROLES as $role) {
            $expected = $defaults[$role];
            $actual = $server[$role];
            sort($expected);
            sort($actual);
            $this->assertSame(
                $expected,
                $actual,
                "PermissionGroupSeeder's '{$role}' defaults have drifted from the client's DEFAULT_GROUP_PERMISSIONS",
            );
            $this->assertEmpty(
                array_diff($actual, $catalogKeys),
                "PermissionGroupSeeder's '{$role}' defaults grant a key that is not in PERMISSION_CATALOG",
            );
        }
    }

    public function test_the_php_catalog_version_and_addition_sets_match_the_client(): void
    {
        [, , $additions] = self::parseClientConstants();

        $this->assertSame(
            max(array_keys($additions)),
            PermissionGroupSeeder::catalogVersion(),
            "PermissionGroupSeeder::CATALOG_VERSION has drifted from the client's PERMISSION_CATALOG_VERSION",
        );

        $server = PermissionGroupSeeder::defaultGroupPermissionAdditions();
        $this->assertSame(array_keys($additions), array_keys($server));

        foreach ($additions as $version => $byRole) {
            foreach ($byRole as $role => $keys) {
                $expected = $keys;
                $actual = $server[$version][$role] ?? [];
                sort($expected);
                sort($actual);
                $this->assertSame(
                    $expected,
                    $actual,
                    "PermissionGroupSeeder's v{$version} additions for '{$role}' have drifted from the client's",
                );
            }
        }
    }
}
