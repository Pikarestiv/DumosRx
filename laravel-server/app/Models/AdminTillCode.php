<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

class AdminTillCode extends Model
{
    use HasUuids;

    protected $fillable = [
        'admin_id',
        'code_hash',
        'code_encrypted',
        'label',
        'last_used_at',
        'expires_at',
        'revoked_at',
    ];

    protected $hidden = ['code_hash', 'code_encrypted'];

    protected $casts = [
        'last_used_at' => 'datetime',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public const LIFETIME_DAYS = 90;

    public function scopeActive($query)
    {
        $query->whereNull('revoked_at');
        $legacyCutoff = now()->subDays(self::LIFETIME_DAYS);

        if (! self::hasExpiresAtColumn()) {
            return $query->where('created_at', '>', $legacyCutoff);
        }

        return $query->where(fn ($q) => $q->where('expires_at', '>', now())
            ->orWhere(fn ($legacy) => $legacy->whereNull('expires_at')->where('created_at', '>', $legacyCutoff)));
    }

    public static function hasExpiresAtColumn(): bool
    {
        return Schema::hasColumn((new self)->getTable(), 'expires_at');
    }

    public function effectiveExpiresAt(): ?CarbonInterface
    {
        return $this->expires_at ?? $this->created_at?->copy()->addDays(self::LIFETIME_DAYS);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
