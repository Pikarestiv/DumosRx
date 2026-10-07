<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Every index declared in a migration must fit the production server's
 * maximum key length.
 *
 * This exists because the entire suite runs on SQLite, which has no key
 * length limit, so 1165 passing tests said nothing about whether a migration
 * could even be applied. `create_sync_commands_table` shipped with
 * `index(['store_id', 'device_id', 'status'])` — 144 + 764 + 96 = 1004 bytes
 * under utf8mb4 — and died on the production box four bytes over, *after* two
 * sibling migrations had already applied. MySQL DDL is not transactional, so
 * that left a half-built schema to clean up by hand.
 *
 * It reads the migration **source**, not the migrated schema: SQLite reports
 * a column's type as a bare `varchar` with no length, so the live test schema
 * cannot answer this question at all. An earlier version of this test did
 * that and passed vacuously against the very migration that was broken.
 *
 * The budget is 1000 bytes — MyISAM/Aria's limit, and what the production
 * host actually reported. InnoDB in DYNAMIC row format allows 3072, but
 * `config/database.php` leaves `'engine' => null`, so a new table takes the
 * server's default engine. Budgeting for the smaller limit is what makes a
 * migration portable across both. See docs/KNOWN_BUGS.md A-179.
 */
class SchemaIndexKeyLengthTest extends TestCase
{
    private const MAX_KEY_BYTES = 1000;

    /** utf8mb4 worst case: every character can take four bytes. */
    private const BYTES_PER_CHAR = 4;

    /** AppServiceProvider calls Schema::defaultStringLength(191). */
    private const DEFAULT_STRING_LENGTH = 191;

    /** A uuid column is `char(36)`; morphs and ulids are fixed too. */
    private const FIXED_WIDTH_TYPES = [
        'uuid' => 36,
        'foreignUuid' => 36,
        'ulid' => 26,
        'foreignUlid' => 26,
    ];

    /** Builder methods that take a name but do not declare a column. */
    private const NOT_COLUMN_METHODS = [
        'index', 'unique', 'primary', 'spatialIndex', 'fullText', 'rawIndex',
        'foreign', 'references', 'on', 'onDelete', 'onUpdate', 'constrained',
        'comment', 'default', 'dropColumn', 'dropIndex', 'dropUnique',
        'dropForeign', 'renameColumn', 'from', 'table', 'create', 'drop',
        'dropIfExists', 'hasTable', 'hasColumn', 'charset', 'collation',
        'engine', 'after', 'change', 'nullable', 'storedAs', 'virtualAs',
    ];

    /**
     * Worst-case indexed byte width for every column a migration declares.
     * A non-character column is fixed and small, so only a character
     * column's declared length can blow the budget.
     *
     * @return array<string, int>
     */
    private function declaredColumnWidths(string $source): array
    {
        $widths = [];

        preg_match_all(
            '/->([A-Za-z]+)\(\s*[\'"]([^\'"]+)[\'"]\s*(?:,\s*(\d+)\s*)?\)?/',
            $source,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            [$method, $name] = [$match[1], $match[2]];

            if (in_array($method, self::NOT_COLUMN_METHODS, true)) {
                continue;
            }

            $explicitLength = isset($match[3]) && $match[3] !== '' ? (int) $match[3] : null;

            $widths[$name] = $this->widthFor($method, $explicitLength);
        }

        return $widths;
    }

    private function widthFor(string $method, ?int $explicitLength): int
    {
        if (isset(self::FIXED_WIDTH_TYPES[$method])) {
            return self::FIXED_WIDTH_TYPES[$method] * self::BYTES_PER_CHAR;
        }

        if (in_array($method, ['string', 'char'], true)) {
            return ($explicitLength ?? self::DEFAULT_STRING_LENGTH) * self::BYTES_PER_CHAR;
        }

        // Indexing one without a prefix length is itself an error, so let the
        // budget reject it rather than encoding a guess.
        if (preg_match('/^(?:tiny|medium|long)?text$/', $method) === 1) {
            return self::MAX_KEY_BYTES + 1;
        }

        return 8;
    }

    /**
     * Comments are stripped before parsing: a commented-out `index([...])`
     * is dead code, and flagging one sends you to fix a line that does
     * nothing. The first version of this test reported exactly that.
     */
    private function withoutComments(string $source): string
    {
        $source = preg_replace('#/\*.*?\*/#s', '', $source);

        return preg_replace('#(^|\s)//.*$#m', '', $source);
    }

    /**
     * @return array<int, array{columns: array<int, string>}>
     */
    private function declaredIndexes(string $source): array
    {
        $indexes = [];

        preg_match_all('/->(?:index|unique)\(\s*\[([^\]]+)\]/', $source, $m);
        foreach ($m[1] as $columnList) {
            preg_match_all('/[\'"]([^\'"]+)[\'"]/', $columnList, $cols);
            if ($cols[1] !== []) {
                $indexes[] = ['columns' => $cols[1]];
            }
        }

        // Single-column form: ->index('col') / ->unique('col')
        preg_match_all('/->(?:index|unique)\(\s*[\'"]([^\'"]+)[\'"]\s*[,)]/', $source, $m);
        foreach ($m[1] as $column) {
            $indexes[] = ['columns' => [$column]];
        }

        return $indexes;
    }

    public function test_no_declared_index_exceeds_the_production_key_length_limit(): void
    {
        $offenders = [];
        $checked = [];

        foreach (glob(database_path('migrations/*.php')) as $file) {
            $source = $this->withoutComments(file_get_contents($file));
            $widths = $this->declaredColumnWidths($source);

            foreach ($this->declaredIndexes($source) as $index) {
                // A column added by a different migration cannot be sized
                // from this file; those are reported as unchecked below
                // rather than silently counted as safe.
                $resolvable = array_filter(
                    $index['columns'],
                    fn ($column) => isset($widths[$column])
                );

                if (count($resolvable) !== count($index['columns'])) {
                    continue;
                }

                $checked[] = implode(',', $index['columns']);
                $bytes = array_sum(array_map(fn ($c) => $widths[$c], $index['columns']));

                if ($bytes > self::MAX_KEY_BYTES) {
                    $offenders[] = sprintf(
                        '%s: index(%s) = %d bytes',
                        basename($file),
                        implode(', ', $index['columns']),
                        $bytes
                    );
                }
            }
        }

        // Guards against the vacuous pass that made the first version of this
        // test useless. Scope: a multi-column index declared in the same
        // migration as its columns — which is the failure class that broke
        // production. An index over a column added by a different migration
        // cannot be sized from one file and is skipped; of 19 composite
        // index declarations in this codebase, 17 resolve.
        $this->assertGreaterThan(
            15,
            count($checked),
            'The migration parser resolved almost no indexes, so this test is not actually checking anything.'
        );

        // The specific index that took production down must be in scope, so
        // this test provably covers the case it was written for.
        $this->assertContains(
            'store_id,device_id,status',
            $checked,
            'The sync_commands index is no longer being checked.'
        );

        $this->assertSame(
            [],
            $offenders,
            "These indexes cannot be created on the production server (limit ".self::MAX_KEY_BYTES
            ." bytes under utf8mb4). Shorten the indexed columns or index fewer of them:\n  "
            .implode("\n  ", $offenders)
        );
    }
}
