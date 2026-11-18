<?php

namespace App\Services\Admin;

use App\Mail\AdminCustomMail;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AdminMailService
{
    public const AUDIENCES = ['all', 'store_owners', 'staff', 'platform_admins', 'specific', 'custom'];

    public const MAX_CUSTOM_EMAILS = 100;

    private const OWNER_ROLES = ['store_owner', 'admin'];

    private const CHUNK_SIZE = 100;

    /**
     * @param  array<int, string>  $userIds
     * @param  array<int, string>  $emails
     */
    public function send(string $subject, string $message, string $audience, array $userIds = [], bool $isHtml = false, array $emails = []): int
    {
        if ($audience === 'custom') {
            return $this->sendToAddresses($subject, $message, $isHtml, $emails);
        }

        $sent = 0;

        $this->recipientQuery($audience, $userIds)->chunkById(self::CHUNK_SIZE, function ($users) use ($subject, $message, $isHtml, &$sent) {
            foreach ($users as $user) {
                $sent += $this->deliver($user->email, $subject, $message, $isHtml, $user->id);
            }
        });

        return $sent;
    }

    /** @param  array<int, string>  $emails */
    private function sendToAddresses(string $subject, string $message, bool $isHtml, array $emails): int
    {
        $sent = 0;

        foreach (array_unique(array_map('strtolower', $emails)) as $email) {
            $sent += $this->deliver($email, $subject, $message, $isHtml, $email);
        }

        return $sent;
    }

    private function deliver(string $email, string $subject, string $message, bool $isHtml, string $label): int
    {
        try {
            Mail::to($email)->send(new AdminCustomMail($subject, $message, $isHtml));

            return 1;
        } catch (\Exception $e) {
            Log::error("Admin email failed for {$label}: ".$e->getMessage());

            return 0;
        }
    }

    /** @return array{subject: string, html: string} */
    public function renderPreview(string $subject, string $message, bool $isHtml): array
    {
        return ['subject' => $subject, 'html' => (new AdminCustomMail($subject, $message, $isHtml))->render()];
    }

    public function sendTest(string $subject, string $message, bool $isHtml, string $email): void
    {
        Mail::to($email)->send(new AdminCustomMail($subject, $message, $isHtml));
    }

    public function recipientCount(string $audience): int
    {
        return $this->recipientQuery($audience)->count();
    }

    /**
     * @param  array<int, string>  $userIds
     * @return Builder<User>
     */
    public function recipientQuery(string $audience, array $userIds = []): Builder
    {
        $query = User::query()
            ->where('is_active', true)
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->where('email', 'not like', '%'.BroadcastEmailService::PLACEHOLDER_EMAIL_DOMAIN);

        return match ($audience) {
            'store_owners' => $query->whereIn('role', self::OWNER_ROLES),
            'platform_admins' => $query->whereIn('role', User::PLATFORM_ROLES),
            'staff' => $query->where(fn (Builder $q) => $q->whereNull('role')
                ->orWhereNotIn('role', [...self::OWNER_ROLES, ...User::PLATFORM_ROLES])),
            'specific' => $query->whereIn('id', $userIds),
            default => $query,
        };
    }
}
