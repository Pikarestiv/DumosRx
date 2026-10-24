<?php

namespace App\Models;

use App\Casts\JsonList;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PermissionGroup extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'store_id',
        'name',
        'based_on_role',
        'is_default',
        'permissions',
        '_version',
        '_synced_at',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'permissions' => JsonList::class,
        '_synced_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<Store, $this>
     */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
