<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperRole
 */
class Role extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'slug', 'description', 'is_system'];

    protected $casts = [
        'is_system' => 'boolean',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function permissions()
    {
        return $this->belongsToMany(Permission::class);
    }
}
