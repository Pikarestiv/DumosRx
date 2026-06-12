<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\DownloadLog;
use Illuminate\Support\Carbon;

class SendAdminDailySummary extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'admin:send-daily-summary';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send daily summary of app downloads to super admins';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $yesterday = Carbon::yesterday();
        $logs = DownloadLog::whereDate('created_at', $yesterday)->get();

        $totalDownloads = $logs->count();
        $platforms = $logs->groupBy('platform')->map->count();

        $lines = [
            "Here is the daily summary of DumosRx app downloads for " . $yesterday->format('Y-m-d') . ":",
            "Total Downloads: {$totalDownloads}",
        ];

        foreach ($platforms as $platform => $count) {
            $lines[] = "- " . ucfirst($platform) . ": {$count}";
        }

        try {
            \App\Services\AdminAlertService::send(
                "Daily App Downloads Summary ({$yesterday->format('Y-m-d')})",
                $lines
            );
            $this->info("Admin daily summary sent successfully.");
        } catch (\Exception $e) {
            $this->error("Failed to send admin daily summary: " . $e->getMessage());
        }
    }
}
