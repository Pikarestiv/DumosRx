<?php

namespace App\Services\Sync;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pullpager */
class PullPager
{
    private array $hasSyncedAtColumnCache = [];

    public function applyPullCursor($query, string $table, $lastSynced): void
    {
        if ($lastSynced && $table !== 'stores') {
            $parsedLastSynced = \Carbon\Carbon::parse($lastSynced)->setTimezone('UTC')->format('Y-m-d H:i:s');
            $physicalTable = $query->getModel()->getTable();
            if (! isset($this->hasSyncedAtColumnCache[$physicalTable])) {
                $this->hasSyncedAtColumnCache[$physicalTable] =
                    \Illuminate\Support\Facades\Schema::hasColumn($physicalTable, '_synced_at');
            }
            if ($this->hasSyncedAtColumnCache[$physicalTable]) {
                $query->where(function ($q) use ($parsedLastSynced) {
                    $q->where('_synced_at', '>', $parsedLastSynced)
                        ->orWhere('updated_at', '>', $parsedLastSynced);
                });
            } else {
                $query->where('updated_at', '>', $parsedLastSynced);
            }
        }
    }

    public function fetchPullPage($query, string $table, int $offset, ?array $cursor = null): array
    {
        if ($table === 'stores') {
            return [$query->get(), false];
        }

        if ($cursor) {
            // The column format, not ISO8601 - SQLite compares datetimes as
            // text (docs/SYNC_PULL_PAGINATION.md, "Why keyset, not OFFSET").
            $at = \Carbon\Carbon::parse($cursor['updated_at'])
                ->setTimezone('UTC')
                ->format($query->getModel()->getDateFormat());
            $id = $cursor['id'];

            $query->where(function ($q) use ($at, $id) {
                $q->where('updated_at', '>', $at)
                    ->orWhere(function ($q2) use ($at, $id) {
                        $q2->where('updated_at', '=', $at)->where('id', '>', $id);
                    });
            });
            $page = $query->orderBy('updated_at')->orderBy('id')->limit(501)->get();
        } else {
            $page = $query->orderBy('updated_at')->orderBy('id')
                ->skip($offset)->limit(501)->get();
        }

        $hasMore = $page->count() > 500;

        return [$hasMore ? $page->slice(0, 500) : $page, $hasMore];
    }

    public function normalizePageCursor($cursor): ?array
    {
        if (! is_array($cursor) || ! isset($cursor['updated_at'], $cursor['id'])) {
            return null;
        }

        if (! is_scalar($cursor['updated_at']) || ! is_scalar($cursor['id'])) {
            return null;
        }

        try {
            \Carbon\Carbon::parse($cursor['updated_at']);
        } catch (\Exception $e) {
            return null;
        }

        return ['updated_at' => $cursor['updated_at'], 'id' => $cursor['id']];
    }
}
