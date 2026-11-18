<?php

namespace App\Services\Admin;

use App\Mail\AdminCustomMail;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AdminMailService
{
    public const AUDIENCES = ['all', 'store_owners', 'staff', 'platform_admins', 'specific'];

    private const OWNER_ROLES = ['store_owner', 'admin'];

    private const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'agent'];

    private const CHUNK_SIZE = 100;

    /** @param  array<int, string>  $userIds */
    public function send(string $subject, string $message, string $audience, array $userIds = [], bool $isHtml = false): int
    {
        $sent = 0;

        $this->recipientQuery($audience, $userIds)->chunkById(self::CHUNK_SIZE, function ($users) use ($subject, $message, $isHtml, &$sent) {
            foreach ($users as $user) {
                try {
                    Mail::to($user->email)->send(new AdminCustomMail($subject, $message, $isHtml));
                    $sent++;
                } catch (\Exception $e) {
                    Log::error("Admin email failed for user {$user->id}: ".$e->getMessage());
                }
            }
        });

        return $sent;
    }

    /**
     * @param  array<int, string>  $userIds
     * @return Builder<User>
     */
    public function recipientQuery(string $audience, array $userIds = []): Builder
    {
        $query = User::query()
            ->whereNotNull('email')
            ->where('email', 'not like', '%'.BroadcastEmailService::PLACEHOLDER_EMAIL_DOMAIN);

        return match ($audience) {
            'store_owners' => $query->whereIn('role', self::OWNER_ROLES),
            'platform_admins' => $query->whereIn('role', self::PLATFORM_ROLES),
            'staff' => $query->whereNotIn('role', [...self::OWNER_ROLES, ...self::PLATFORM_ROLES]),
            'specific' => $query->whereIn('id', $userIds),
            default => $query,
        };
    }
}
