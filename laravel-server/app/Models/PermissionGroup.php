<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PermissionGroup extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id',
        'name',
        'based_on_role',
        'is_default',
        'permissions',
        '_version',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'permissions' => 'array',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
