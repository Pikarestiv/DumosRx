<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Mail\FunnelSetupReminderEmail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class SendFunnelReminders extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'funnel:remind';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send automated setup reminder emails to users using exponential backoff (24h, 3 days, 7 days).';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $now = now();

        // Find users who are active, but haven't logged in from a desktop app
        $users = User::where('is_active', true)
            ->where('setup_reminder_level', '<', 3) // Stop after 3 reminders
            ->whereDoesntHave('tokens', function ($query) {
                // If they have any token that isn't 'web', they've logged in from the desktop app
                $query->where('name', '!=', 'web');
            })
            ->get();

        $emailsSent = 0;

        foreach ($users as $user) {
            $shouldSend = false;

            if ($user->setup_reminder_level === 0) {
                // First reminder: 24 hours after registration
                if ($user->created_at->diffInHours($now) >= 24) {
                    $shouldSend = true;
                }
            } elseif ($user->setup_reminder_level === 1) {
                // Second reminder: 72 hours (3 days) after first reminder
                if ($user->setup_reminder_last_sent_at && clone $user->setup_reminder_last_sent_at->addHours(72) <= $now) {
                    $shouldSend = true;
                }
            } elseif ($user->setup_reminder_level === 2) {
                // Third reminder: 7 days (168 hours) after second reminder
                if ($user->setup_reminder_last_sent_at && clone $user->setup_reminder_last_sent_at->addDays(7) <= $now) {
                    $shouldSend = true;
                }
            }

            if ($shouldSend) {
                try {
                    Mail::to($user->email)->send(new FunnelSetupReminderEmail($user));
                    
                    $user->setup_reminder_level += 1;
                    $user->setup_reminder_last_sent_at = $now;
                    $user->save();
                    
                    $emailsSent++;
                    $this->info("Sent funnel reminder level {$user->setup_reminder_level} to {$user->email}");
                } catch (\Exception $e) {
                    Log::error("Failed to send funnel reminder to {$user->email}: " . $e->getMessage());
                }
            }
        }

        $this->info("Funnel reminder job completed. Sent {$emailsSent} emails.");
    }
}
