<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SaleItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'sale_id', 'medicine_id', 'inventory_id', 'quantity',
        'unit_price', 'discount_amount', 'total_price', 'cost_price'
    ];
}
