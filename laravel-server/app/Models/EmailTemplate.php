<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperEmailTemplate
 */
class EmailTemplate extends Model
{
    use HasFactory;

    protected $fillable = ['key', 'name', 'subject', 'content', 'variables'];

    protected $casts = [
        'variables' => 'array',
    ];
}
