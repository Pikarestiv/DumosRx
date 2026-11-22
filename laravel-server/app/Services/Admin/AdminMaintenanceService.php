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

    /**
     * Resolved through the `migrator` alias, never constructor-injected:
     * MigrationServiceProvider is deferred, so type-hinting the concrete
     * Migrator makes the container auto-wire it and fail on the unbound
     * MigrationRepositoryInterface. See laravel-server/AGENTS.md.
     */
    private function migrator(): Migrator
    {
        return app('migrator');
    }

    /**
     * @return array{status: string, pending: array<int, array{name: string, alters_existing_data: bool}>, pending_count: int|null, last_batch: int|null, error: string|null}
     */
    public function migrationStatus(): array
    {
        try {
            $ran = $this->migrator()->getRepository()->getRan();
            $batches = $this->migrator()->getRepository()->getMigrationBatches();
        } catch (\Throwable $e) {
            return $this->unknownStatus($e->getMessage());
        }

        $pending = [];

        foreach ($this->migrator()->getMigrationFiles([database_path('migrations')]) as $name => $path) {
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
     * @return array{ok: bool, output: string}
     */
    public function syncRolesAndPermissions(string $actorId): array
    {
        $ok = true;

        try {
            Artisan::call('db:seed', [
                '--class' => 'Database\\Seeders\\RolesAndPermissionsSeeder',
                '--force' => true,
            ]);
            $output = Artisan::output();
        } catch (\Throwable $e) {
            $ok = false;
            $output = $e->getMessage();
        }

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'ROLES_PERMISSIONS_SYNCED',
            'description' => $ok
                ? 'Synced roles and permissions from the seeder'
                : 'Roles and permissions sync FAILED',
            'properties' => ['ok' => $ok],
        ]);

        return [
            'ok' => $ok,
            'output' => Str::limit($output, self::MAX_OUTPUT_LENGTH),
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

    public function backupStatus(): array
    {
        $backups = app(\App\Services\Backup\DatabaseBackupService::class);
        $bucketConfigured = filled(config('database_backup.bucket'));
        $publicKeyConfigured = filled(config('database_backup.public_key'));
        $configured = $backups->isConfigured();
        $recentBackups = [];
        $listError = null;

        if ($configured) {
            try {
                $disk = $backups->disk();
                $files = $disk->allFiles('daily');
                rsort($files);
                foreach (array_slice($files, 0, 5) as $key) {
                    $recentBackups[] = [
                        'key' => $key,
                        'bytes' => $disk->size($key),
                        'last_modified' => \Carbon\Carbon::createFromTimestamp($disk->lastModified($key))->toIso8601String(),
                    ];
                }
            } catch (\Throwable $e) {
                $listError = $e->getMessage();
            }
        }

        return [
            'configured' => $configured,
            'bucket_configured' => $bucketConfigured,
            'public_key_configured' => $publicKeyConfigured,
            'disk' => (string) config('database_backup.disk'),
            'schedule' => 'Daily at 23:00 Africa/Lagos',
            'last_run' => $backups->lastRun(),
            'recent_backups' => $recentBackups,
            'list_error' => $listError,
        ];
    }

    public function runBackup(?string $actorId = null): array
    {
        $backups = app(\App\Services\Backup\DatabaseBackupService::class);
        if (! $backups->isConfigured()) {
            return [
                'ok' => false,
                'status' => 422,
                'output' => 'Database backups are not configured. Set R2_BACKUP_BUCKET and BACKUP_ENCRYPTION_PUBLIC_KEY in the server environment.',
                'status_after' => $this->backupStatus(),
            ];
        }

        try {
            $result = $backups->run(now('Africa/Lagos'));
        } catch (\Throwable $e) {
            $backups->recordLastRun('failed', 'manual', null, $e->getMessage());
            \Illuminate\Support\Facades\Log::critical('Manual database backup failed', [
                'error' => $e->getMessage(),
                'actor_id' => $actorId,
            ]);

            return [
                'ok' => false,
                'status' => 500,
                'output' => $e->getMessage(),
                'status_after' => $this->backupStatus(),
            ];
        }

        $backups->recordLastRun('ok', 'manual', $result);
        $monthlySuffix = $result['monthly_key'] ? " and {$result['monthly_key']}" : '';
        $output = "Wrote {$result['key']} ({$result['bytes']} bytes){$monthlySuffix}.";

        \App\Models\ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'maintenance_backup_run',
            'table_name' => 'system',
            'record_id' => $result['key'],
            'changes' => $result,
        ]);

        \Illuminate\Support\Facades\Log::info('Manual database backup written', $result);

        return [
            'ok' => true,
            'status' => 200,
            'result' => $result,
            'output' => $output,
            'status_after' => $this->backupStatus(),
        ];
    }
}
