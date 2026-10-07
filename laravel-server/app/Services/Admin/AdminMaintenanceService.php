<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class AdminMaintenanceService
{
    private const MAX_OUTPUT_LENGTH = 20000;

    private const DESTRUCTIVE_PATTERNS = [
        'dropColumn',
        'dropIfExists',
        '->drop(',
        'renameColumn',
        'Schema::rename',
        'truncate',
        'delete(',
    ];

    public function __construct(private Migrator $migrator) {}

    /**
     * @return array{status: string, pending: array<int, array{name: string, alters_existing_data: bool}>, pending_count: int|null, last_batch: int|null, error: string|null}
     */
    public function migrationStatus(): array
    {
        try {
            $ran = $this->migrator->getRepository()->getRan();
            $batches = $this->migrator->getRepository()->getMigrationBatches();
        } catch (\Throwable $e) {
            return $this->unknownStatus($e->getMessage());
        }

        $pending = [];

        foreach ($this->migrator->getMigrationFiles([database_path('migrations')]) as $name => $path) {
            if (! in_array($name, $ran, true)) {
                $pending[] = [
                    'name' => $name,
                    'alters_existing_data' => $this->fileAltersExistingData($path),
                ];
            }
        }

        return [
            'status' => 'ok',
            'pending' => $pending,
            'pending_count' => count($pending),
            'last_batch' => empty($batches) ? null : max($batches),
            'error' => null,
        ];
    }

    /**
     * @return array{ok: bool, applied: array<int, string>, output: string, status_after: array}
     */
    public function runPendingMigrations(string $actorId): array
    {
        $before = array_column($this->migrationStatus()['pending'], 'name');

        $ok = true;

        try {
            Artisan::call('migrate', ['--force' => true]);
            $output = Artisan::output();
        } catch (\Throwable $e) {
            $ok = false;
            $output = $e->getMessage();
        }

        $after = $this->migrationStatus();
        $applied = array_values(array_diff($before, array_column($after['pending'], 'name')));

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'MIGRATIONS_RUN',
            'description' => $ok
                ? 'Applied '.count($applied).' pending migration(s)'
                : 'Migration run FAILED after applying '.count($applied).' migration(s)',
            'properties' => [
                'applied' => $applied,
                'ok' => $ok,
                'pending_after' => $after['pending_count'],
            ],
        ]);

        return [
            'ok' => $ok,
            'applied' => $applied,
            'output' => Str::limit($output, self::MAX_OUTPUT_LENGTH),
            'status_after' => $after,
        ];
    }

    /**
     * A syntactic scan of the migration's own `up()` body. It reads source
     * text, so it can flag a mention in a comment and can miss destructive
     * raw SQL — it exists to make an operator look, never to certify safety.
     */
    public function fileAltersExistingData(string $path): bool
    {
        $up = $this->upMethodBody(File::get($path));

        foreach (self::DESTRUCTIVE_PATTERNS as $pattern) {
            if (str_contains($up, $pattern)) {
                return true;
            }
        }

        return false;
    }

    private function upMethodBody(string $source): string
    {
        $start = strpos($source, 'function up(');

        if ($start === false) {
            return '';
        }

        $end = strpos($source, 'function down(', $start);

        return $end === false ? substr($source, $start) : substr($source, $start, $end - $start);
    }

    /** A null count, never zero: "none" and "don't know" must not render alike. */
    private function unknownStatus(string $error): array
    {
        return [
            'status' => 'unknown',
            'pending' => [],
            'pending_count' => null,
            'last_batch' => null,
            'error' => $error,
        ];
    }
}
