<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Inventory extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'inventory';

    protected $fillable = [
        'medicine_id', 'batch_number', 'quantity_in_stock', 'quantity_reserved',
        'reorder_level', 'max_stock_level', 'cost_price', 'selling_price',
        'manufacture_date', 'expiry_date', 'supplier_id', 'location', 'status'
    ];

    protected $casts = [
        'manufacture_date' => 'date',
        'expiry_date' => 'date',
        'cost_price' => 'decimal:2',
        'selling_price' => 'decimal:2',
    ];

    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }
}
