<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per (user, device) a staff member has ever synced from - purely
 * an admin-support record, never consulted for sync correctness or access
 * control. See laravel-server/AGENTS.md, "Per-device sync visibility".
 */
class UserDevice extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id', 'store_id', 'device_id', 'device_label', 'last_synced_at',
    ];

    protected $casts = [
        'last_synced_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Store, $this>
     */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
