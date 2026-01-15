<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class License extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'subscription_id', 'machine_id', 'machine_name',
        'last_check_in', 'is_active'
    ];

    protected $casts = [
        'last_check_in' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function subscription()
    {
        return $this->belongsTo(Subscription::class);
    }
}
