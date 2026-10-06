<?php

namespace App\Console\Commands;

use App\Models\SyncFailure;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PruneSyncFailures extends Command
{
    private const RETENTION_DAYS = 90;

    protected $signature = 'sync:prune-failures';

    protected $description = 'Delete recorded sync push failures older than the retention window.';

    public function handle(): int
    {
        $deleted = SyncFailure::where('created_at', '<', now()->subDays(self::RETENTION_DAYS))->delete();

        if ($deleted > 0) {
            Log::info("sync:prune-failures deleted {$deleted} recorded failure(s).");
        }

        $this->info("Deleted {$deleted} sync failure record(s) older than ".self::RETENTION_DAYS.' days.');

        return self::SUCCESS;
    }
}
