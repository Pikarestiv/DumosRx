<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * @mixin IdeHelperPaymentAccount
 */
class PaymentAccount extends Model
{
    use HasFactory, SoftDeletes;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'user_id',
        'store_id',
        'name',
        'account_type',
        'account_number',
        'bank_name',
        'is_active',
        'sort_order',
        '_version',
        '_synced',
        '_synced_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        '_synced' => 'boolean',
        '_synced_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }
}
