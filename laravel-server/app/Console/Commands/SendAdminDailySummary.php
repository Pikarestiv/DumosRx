<?php

namespace App\Console\Commands;

use App\Services\Admin\AdminDailySummaryService;
use App\Services\AdminAlertService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendAdminDailySummary extends Command
{
    protected $signature = 'admin:send-daily-summary {--date= : Report calendar date (YYYY-MM-DD, Africa/Lagos); defaults to yesterday}';

    protected $description = 'Send the daily platform operations, PWA activity, commerce, and sync health summary to super admins';

    public function handle(AdminDailySummaryService $summaryService): int
    {
        $dateOption = $this->option('date');
        $targetDate = null;

        if (is_string($dateOption) && trim($dateOption) !== '') {
            $rawDate = trim($dateOption);
            try {
                $targetDate = Carbon::createFromFormat('!Y-m-d', $rawDate, 'Africa/Lagos');
            } catch (\Throwable) {
                $targetDate = null;
            }

            if (! $targetDate || $targetDate->format('Y-m-d') !== $rawDate) {
                $this->error('Invalid --date format. Expected YYYY-MM-DD.');

                return self::FAILURE;
            }
        }

        $summary = $summaryService->buildForDate($targetDate);

        try {
            AdminAlertService::send(
                $summary['title'],
                $summary['lines'],
                $summary['details'],
            );
            $this->info('Admin daily platform summary sent successfully.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Failed to send admin daily summary: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}
