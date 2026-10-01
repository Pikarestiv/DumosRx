<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Retention sweep for the per-tenant manual backups uploaded through
 * BackupController. Scheduled nightly (routes/console.php); see
 * config/backups.php for the window and laravel-server/AGENTS.md for why
 * the newest file per tenant is always kept.
 */
class PruneBackups extends Command
{
    protected $signature = 'backups:prune {--days= : Override the retention window in days}';

    protected $description = 'Delete tenant backup uploads older than the retention window, always keeping each tenant\'s newest backup.';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?: config('backups.retention_days'));
        $cutoff = now()->subDays($days)->getTimestamp();
        $deleted = 0;

        foreach (Storage::directories('backups') as $directory) {
            $deleted += $this->pruneDirectory($directory, $cutoff);
        }

        $this->info("Pruned {$deleted} backup file(s) older than {$days} day(s).");

        if ($deleted > 0) {
            Log::info("backups:prune removed {$deleted} file(s) older than {$days} day(s).");
        }

        return self::SUCCESS;
    }

    private function pruneDirectory(string $directory, int $cutoff): int
    {
        $files = collect(Storage::files($directory))
            ->sortByDesc(fn ($file) => Storage::lastModified($file))
            ->values();

        return $files->skip(1)
            ->filter(fn ($file) => Storage::lastModified($file) < $cutoff)
            ->each(fn ($file) => Storage::delete($file))
            ->count();
    }
}
