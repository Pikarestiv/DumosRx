<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Subscription;
use App\Models\User;
use App\Mail\EndOfDaySummaryMail;
use App\Services\SubscriptionService;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendEndOfDaySummaries extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'summary:end-of-day';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sends end-of-day summary emails to Pro and Enterprise store owners.';

    /**
     * Execute the console command.
     */
    public function handle(SubscriptionService $subscriptionService)
    {
        $this->info('Starting End of Day Summary job...');

        // Every subscription is owned by a subscription OWNER (staff inherit
        // via SubscriptionService::getSubscriptionOwner() but never own rows
        // here directly), so iterate the distinct set of owners that have
        // ever held a subscription rather than hardcoding a tier list.
        $ownerIds = Subscription::query()->distinct()->pluck('user_id');
        $owners = User::whereIn('id', $ownerIds)->get();

        foreach ($owners as $user) {
            // Mirrors StoreSummaryController::sendSummary() — gate on the
            // daily_summary_email feature flag (grace-period aware via
            // resolveEffectiveSubscription()) instead of a raw
            // status='active' check with no end_date filter, which never
            // stops sending once a subscription lapses.
            if (!$subscriptionService->hasFeature($user, 'daily_summary_email')) {
                continue;
            }

            $subscription = $subscriptionService->resolveEffectiveSubscription($user);
            if (!$subscription) {
                continue;
            }

            try {
                // The EndOfDaySummaryMail constructor aggregates the metrics per-tenant
                Mail::to($user->email)->send(new EndOfDaySummaryMail($user, $subscription));

                $this->info("Sent summary to {$user->email}.");
            } catch (Throwable $e) {
                // One bad recipient/mailer failure shouldn't abort the run
                // for every other store.
                Log::error('Failed to send end-of-day summary email', [
                    'user_id' => $user->id,
                    'email' => $user->email,
                    'error' => $e->getMessage(),
                ]);
                $this->error("Failed to send summary to {$user->email}: {$e->getMessage()}");
            }
        }

        $this->info('Job completed.');
    }
}
