<?php

namespace App\Services\Admin;

use App\Mail\AdminCustomMail;
use App\Models\Broadcast;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class BroadcastEmailService
{
    private const PLACEHOLDER_EMAIL_DOMAIN = '@local.dumosrx.com';

    private const CHUNK_SIZE = 100;

    public function sendForBroadcast(Broadcast $broadcast): int
    {
        if (! $broadcast->send_email || ! $this->isDeliverable($broadcast)) {
            return 0;
        }

        $sent = 0;

        $this->recipientQuery($broadcast)->chunkById(self::CHUNK_SIZE, function ($recipients) use ($broadcast, &$sent) {
            foreach ($recipients as $recipient) {
                try {
                    Mail::to($recipient->email)->send(new AdminCustomMail($broadcast->title, $broadcast->message));
                    $sent++;
                } catch (\Exception $e) {
                    Log::error("Broadcast email failed for user {$recipient->id}: " . $e->getMessage());
                }
            }
        });

        return $sent;
    }

    private function isDeliverable(Broadcast $broadcast): bool
    {
        return Broadcast::active()->whereKey($broadcast->getKey())->exists();
    }

    private function recipientQuery(Broadcast $broadcast): Builder
    {
        $query = User::query()
            ->whereHas('stores')
            ->whereNotNull('email')
            ->where('email', 'not like', '%' . self::PLACEHOLDER_EMAIL_DOMAIN);

        if ($broadcast->target_type === 'specific') {
            $query->whereIn('id', $broadcast->user_ids ?: []);
        }

        return $query;
    }
}
