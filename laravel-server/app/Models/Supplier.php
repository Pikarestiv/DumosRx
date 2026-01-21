<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'name', 'contact_person', 'email', 'phone', 'address', 
        'city', 'state', 'country', 'tax_id', 'payment_terms', 
        'is_active', 'rating'
    ];

    public function medicines()
    {
        return $this->hasMany(Medicine::class);
    }
}
