<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * One row per (user, device) a staff member has ever synced from - purely
 * an admin-support record, never consulted for sync correctness or access
 * control. See laravel-server/AGENTS.md, "Per-device sync visibility".
 *
 * @mixin IdeHelperUserDevice
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

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
