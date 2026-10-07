<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperActivityLog
 */
class ActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'store_id',
        'action',
        'description',
        'ip_address',
        'user_agent',
        'properties', // JSON column for extra data
        'table_name',
        'record_id',
        'details',
        'correlation_id',
        'occurrence_count',
        'last_occurred_at',
        '_version',
    ];

    protected $casts = [
        'properties' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Super-admin actions are privileged operational detail — role changes,
     * subscription overrides, migrations, device commands — not peer
     * accountability. Every read path that an operator below super_admin can
     * reach must apply this, or it becomes the way around the others.
     * Fails closed for an unauthenticated caller.
     */
    public function scopeVisibleToCurrentOperator($query)
    {
        $viewer = \Illuminate\Support\Facades\Auth::user();

        if ($viewer && $viewer->hasRole('super_admin')) {
            return $query;
        }

        // Matches User::hasRole(): a super admin identified only by role_id
        // would otherwise leak through the flat-column check.
        return $query->whereDoesntHave('user', function ($uq) {
            $uq->where('role', 'super_admin')
                ->orWhereHas('userRole', fn ($rq) => $rq->where('slug', 'super_admin'));
        });
    }

}
