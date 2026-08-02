<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'first_name', 'last_name', 'email', 'phone', 'address',
        'date_of_birth', 'gender', 'allergies', 'medical_conditions', 'loyalty_points',
        'user_id', 'credit_limit', 'outstanding_balance', 'notes', 'is_active'
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'allergies' => 'array',
    ];

    public function sales()
    {
        return $this->hasMany(Sale::class);
    }
}
