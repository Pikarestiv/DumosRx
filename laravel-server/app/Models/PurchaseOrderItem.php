<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PurchaseOrderItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'purchase_order_id', 'medicine_id', 'quantity_ordered', 'quantity_received',
        'unit_cost', 'total_cost', 'batch_number', 'expiry_date', 'status'
    ];

    protected $casts = [
        'expiry_date' => 'date',
    ];

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }
}
