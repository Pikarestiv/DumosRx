<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditSessionItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'audit_session_id',
        'product_id',
        'system_quantity',
        'counted_quantity',
        'cost_price',
        'counted_cost_price',
        'selling_price',
        'counted_selling_price',
        'counted',
        'notes',
        'counted_at',
    ];

    protected $casts = [
        'system_quantity' => 'decimal:2',
        'counted_quantity' => 'decimal:2',
        'cost_price' => 'decimal:2',
        'counted_cost_price' => 'decimal:2',
        'selling_price' => 'decimal:2',
        'counted_selling_price' => 'decimal:2',
        'counted' => 'boolean',
        'counted_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(AuditSession::class, 'audit_session_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}
