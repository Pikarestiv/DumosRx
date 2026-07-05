<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class SupplierPayment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'supplier_id',
        'po_id',
        'amount',
        'payment_date',
        'payment_method',
        'reference_note',
        '_version',
        '_synced',
        '_synced_at',
        '_deleted',
    ];
    
    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'payment_date' => 'datetime',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class, 'po_id');
    }
}
