<?php

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * One reverse-chronological stream across every source that records something
 * happening on the platform. See the Phase 6 spec for why it is cursor- rather
 * than offset-paginated, and why `payment` is gated by the caller's role
 * instead of by the request.
 */
class AdminActivityFeedService
{
    public const MAX_LIMIT = 50;

    /** Types any platform operator may read. */
    private const GENERAL_TYPES = ['admin_action', 'sync_failure', 'subscription'];

    /** Types carrying money, restricted exactly as Phases 3 and 4 restrict revenue. */
    private const RESTRICTED_TYPES = ['payment'];

    public function __construct(private AdminActivityFeedSources $sources) {}

    public function feed(User $viewer, ?string $type, ?string $cursor, int $limit): array
    {
        $available = $this->availableTypes($viewer);
        $limit = max(1, min($limit, self::MAX_LIMIT));

        if ($type !== null && ! in_array($type, $available, true)) {
            throw new \InvalidArgumentException("Unavailable activity type: {$type}");
        }

        $before = $cursor ? Carbon::parse($cursor) : now()->addDay();
        $wanted = $type !== null ? [$type] : $available;

        $events = [];

        foreach ($wanted as $source) {
            foreach ($this->sources->fetch($source, $before, $limit) as $event) {
                $events[] = $event;
            }
        }

        usort($events, fn (array $a, array $b) => [$b['at'], $b['type'], $b['id']] <=> [$a['at'], $a['type'], $a['id']]);

        $page = array_slice($events, 0, $limit);

        return [
            'events' => $page,
            'available_types' => $available,
            'next_cursor' => count($events) > $limit && $page !== []
                ? end($page)['at']
                : null,
        ];
    }

    /** @return array<int, string> */
    public function availableTypes(User $viewer): array
    {
        return $viewer->role === 'super_admin'
            ? array_merge(self::GENERAL_TYPES, self::RESTRICTED_TYPES)
            : self::GENERAL_TYPES;
    }
}
