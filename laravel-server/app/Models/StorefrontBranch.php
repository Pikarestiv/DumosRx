<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $store_id
 * @property string $user_id
 * @property string $slug
 */
class StorefrontBranch extends Model
{
    use HasUuids;

    protected $fillable = ['store_id', 'user_id', 'slug'];
}
