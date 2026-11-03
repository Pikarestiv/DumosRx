<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AuditSession extends Model
{
    use HasFactory, HasUuids;

    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_COMPLETION_PENDING_SYNC = 'completion_pending_sync';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_ABANDONED = 'abandoned';

    protected $fillable = [
        'store_id',
        'created_by',
        'name',
        'notes',
        'status',
        'active_till_id',
        'active_till_name',
        'active_user_id',
        'lease_version',
        'lease_expires_at',
        'total_items_count',
        'counted_items_count',
        'submitted_stock_audit_id',
        'started_at',
        'completed_at',
        'last_synced_at',
    ];

    protected $casts = [
        'lease_version' => 'integer',
        'lease_expires_at' => 'datetime',
        'total_items_count' => 'integer',
        'counted_items_count' => 'integer',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'last_synced_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function activeUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'active_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(AuditSessionItem::class, 'audit_session_id');
    }

    public function isLeaseExpired(): bool
    {
        if (! $this->lease_expires_at) {
            return true;
        }

        return $this->lease_expires_at->isPast();
    }

    public function isHeldBy(?string $tillId, ?int $leaseVersion = null): bool
    {
        if (! $tillId || $this->active_till_id !== $tillId) {
            return false;
        }

        if ($leaseVersion !== null && $this->lease_version !== $leaseVersion) {
            return false;
        }

        return ! $this->isLeaseExpired();
    }
}
