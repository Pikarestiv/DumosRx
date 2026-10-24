<?php

namespace App\Console\Commands;

use App\Mail\FunnelSetupReminderEmail;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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

        $users = User::query()->where('is_active', true)
            ->where('setup_reminder_level', '<', 3)
            ->whereDoesntHave('tokens', function ($query) {
                $query->where('name', '!=', 'web');
            })
            ->get();

        $emailsSent = 0;

        foreach ($users as $user) {
            /** @var \App\Models\User $user */
            if ($this->isReminderDue($user, $now)) {
                try {
                    Mail::to($user->email)->send(new FunnelSetupReminderEmail($user));

                    $user->setup_reminder_level += 1;
                    $user->setup_reminder_last_sent_at = $now;
                    $user->save();

                    $emailsSent++;
                    $this->info("Sent funnel reminder level {$user->setup_reminder_level} to {$user->email}");
                } catch (\Exception $e) {
                    Log::error("Failed to send funnel reminder to {$user->email}: ".$e->getMessage());
                }
            }
        }

        $this->info("Funnel reminder job completed. Sent {$emailsSent} emails.");
    }

    private function isReminderDue(User $user, Carbon $now): bool
    {
        if ($user->setup_reminder_level === 0) {
            return $user->created_at->diffInHours($now) >= 24;
        }

        if (! $user->setup_reminder_last_sent_at) {
            return false;
        }

        $lastSentAt = Carbon::parse($user->setup_reminder_last_sent_at);

        return match ($user->setup_reminder_level) {
            1 => $lastSentAt->addHours(72) <= $now,
            2 => $lastSentAt->addDays(7) <= $now,
            default => false,
        };
    }
}
