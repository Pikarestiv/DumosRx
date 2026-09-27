<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperFeedback
 */
class Feedback extends Model
{
    use HasFactory;

    protected $table = 'feedback';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'type',
        'content',
        'contact_email',
        'status',
        'fingerprint',
        'occurrence_count',
        'last_occurred_at',
        '_deleted',
        'created_at',
        'updated_at'
    ];

    protected $casts = [
        '_deleted' => 'boolean',
    ];
}
