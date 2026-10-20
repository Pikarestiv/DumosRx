<?php

namespace App\Services\Sync;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Re-stamps `_synced_at` on every row a push wrote, immediately before its
 * outer commit, so the stamp records when the row became visible rather than
 * when its change was processed (A-286). Query builder only: Eloquent would
 * move `updated_at` and fire model events. Rationale in
 * laravel-server/AGENTS.md, "The pull watermark lags".
 */
class PushedRowRestamper
{
    private const CHUNK_SIZE = 500;

    /** @var array<string, array{key: string, ids: array<string, true>}> */
    private array $pending = [];

    /** @var array<string, array{key: string, ids: array<string, true>}> */
    private array $written = [];

    /** @var array<string, bool> */
    private array $hasSyncedAt = [];

    public function remember(Model $row): void
    {
        $this->add($this->pending, $row);
    }

    public function commitChange(): void
    {
        foreach ($this->pending as $table => $entry) {
            foreach (array_keys($entry['ids']) as $id) {
                $this->written[$table]['key'] = $entry['key'];
                $this->written[$table]['ids'][$id] = true;
            }
        }
        $this->pending = [];
    }

    public function discardChange(): void
    {
        $this->pending = [];
    }

    public function restamp(\DateTimeInterface $at): void
    {
        foreach ($this->written as $table => $entry) {
            if (! $this->tableHasSyncedAt($table)) {
                continue;
            }

            foreach (array_chunk(array_keys($entry['ids']), self::CHUNK_SIZE) as $ids) {
                DB::table($table)->whereIn($entry['key'], $ids)->update(['_synced_at' => $at]);
            }
        }
    }

    private function add(array &$bucket, Model $row): void
    {
        $key = $row->getKey();
        if ($key === null) {
            return;
        }

        $table = $row->getTable();
        $bucket[$table]['key'] = $row->getKeyName();
        $bucket[$table]['ids'][(string) $key] = true;
    }

    private function tableHasSyncedAt(string $table): bool
    {
        return $this->hasSyncedAt[$table] ??= Schema::hasColumn($table, '_synced_at');
    }
}
