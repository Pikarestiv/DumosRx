<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Store;
use App\Models\Subscription;
use App\Mail\EndOfDaySummaryMail;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;

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
    public function handle()
    {
        $this->info('Starting End of Day Summary job...');

        // Fetch subscriptions that are Pro or Enterprise and currently active
        $subscriptions = Subscription::with('user.stores')
            ->whereIn('plan_name', ['pro', 'enterprise'])
            ->where('status', 'active')
            ->get();

        foreach ($subscriptions as $subscription) {
            $user = $subscription->user;
            if (!$user) {
                continue;
            }

            // The EndOfDaySummaryMail constructor aggregates the metrics per-tenant
            Mail::to($user->email)->send(new EndOfDaySummaryMail($user, $subscription));
            
            $this->info("Sent summary to {$user->email}.");
        }

        $this->info('Job completed.');
    }
}
