<?php

namespace App\Console\Commands;

use App\Services\AdminAlertService;
use App\Services\Backup\DatabaseBackupService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class BackupDatabase extends Command
{
    protected $signature = 'backups:database';

    protected $description = 'Dump the whole database, encrypt it and write it to the private R2 backup bucket.';

    public function handle(DatabaseBackupService $backups): int
    {
        if (! $backups->isConfigured()) {
            $this->info('Database backups are not configured; nothing to do.');

            return self::SUCCESS;
        }

        try {
            $result = $backups->run(now('Africa/Lagos'));
        } catch (Throwable $e) {
            $backups->recordLastRun('failed', 'scheduled', null, $e->getMessage());
            Log::critical('Nightly database backup failed', ['error' => $e->getMessage()]);
            AdminAlertService::send(
                'Nightly database backup failed',
                [$e->getMessage(), 'Run backups:database again and check the log.'],
                [
                    'severity' => 'critical',
                    'badge' => 'Backup Failed',
                    'meta' => array_filter([
                        'Bucket' => (string) config('database_backup.bucket'),
                        'Connection' => (string) config('database.default'),
                    ]),
                    'action' => [
                        'label' => 'Open Operations Health',
                        'url' => rtrim((string) config('app.frontend_url', 'https://dumosrx.com'), '/').'/admin/operations',
                    ],
                ],
            );
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $backups->recordLastRun('ok', 'scheduled', $result);
        Log::info('Nightly database backup written', $result);
        $this->info("Wrote {$result['key']} ({$result['bytes']} bytes).");

        return self::SUCCESS;
    }
}
