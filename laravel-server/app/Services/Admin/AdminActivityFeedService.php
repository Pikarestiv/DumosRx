<?php

namespace App\Services\Admin;

use App\Models\User;

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

        $isSuperAdmin = $viewer->role === 'super_admin';
        $after = $this->decodeCursor($cursor);
        $wanted = $type !== null ? [$type] : $available;

        $events = [];

        foreach ($wanted as $source) {
            // One extra per source: "is there another page" cannot be derived
            // from the merged count, because a single source can hold every
            // event and never exceed the limit on its own.
            foreach ($this->sources->fetch($source, $after, $limit + 1, $isSuperAdmin) as $event) {
                $events[] = $event;
            }
        }

        usort($events, fn (array $a, array $b) => $this->sortKey($b) <=> $this->sortKey($a));

        $page = array_slice($events, 0, $limit);
        $last = end($page) ?: null;

        return [
            'events' => $page,
            'available_types' => $available,
            'next_cursor' => count($events) > $limit && $last ? $this->encodeCursor($last) : null,
        ];
    }

    /** @return array<int, string> */
    public function availableTypes(User $viewer): array
    {
        return $viewer->role === 'super_admin'
            ? array_merge(self::GENERAL_TYPES, self::RESTRICTED_TYPES)
            : self::GENERAL_TYPES;
    }

    /** The event id is prefixed with its source, so (at, id) is a total order. */
    private function sortKey(array $event): array
    {
        return [$event['at'], $event['id']];
    }

    /**
     * The timestamp alone is not a position: these sources are second-granular
     * and one bulk action writes many rows in the same second, so a strictly
     * older-than fetch made every event sharing the boundary unreachable. The
     * cursor carries the full sort key and the boundary second is re-fetched,
     * with everything at or after the exact position discarded.
     */
    private function encodeCursor(array $event): string
    {
        return base64_encode(implode("\0", $this->sortKey($event)));
    }

    /** @return array{0: string, 1: string}|null */
    private function decodeCursor(?string $cursor): ?array
    {
        if ($cursor === null) {
            return null;
        }

        $decoded = base64_decode($cursor, true);
        $parts = $decoded === false ? [] : explode("\0", $decoded);

        return count($parts) === 2 ? [$parts[0], $parts[1]] : null;
    }
}
