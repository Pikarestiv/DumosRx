<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SaleReturn extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $table = 'returns';

    protected $fillable = [
        'sale_id', 'user_id', 'reason', 'total_refunded',
        '_version', '_synced', '_synced_at', '_deleted'
    ];

    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'total_refunded' => 'decimal:2',
    ];

    public function items()
    {
        return $this->hasMany(SaleReturnItem::class, 'return_id');
    }

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
