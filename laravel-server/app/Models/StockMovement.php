<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'inventory_id', 'medicine_id', 'movement_type', 'quantity',
        'unit_cost', 'total_cost', 'reference_id', 'reference_type',
        'reason', 'performed_by', 'movement_date'
    ];

    protected $casts = [
        'movement_date' => 'datetime',
        'quantity' => 'integer',
        'unit_cost' => 'decimal:2',
        'total_cost' => 'decimal:2',
    ];

    public function inventory()
    {
        return $this->belongsTo(Inventory::class);
    }

    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
