<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * @mixin IdeHelperStore
 */
class Store extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'name',
        'store_slug',
        'store_type',
        'address',
        'phone',
        'email',
        'currency',
        'vat_percentage',
        'pcn_license',
        'receipt_header',
        'receipt_footer',
        'show_logo_on_receipt',
        'show_contact_on_receipt',
        'hide_powered_by',
        'low_stock_warning',
        'expiry_warning',
        'expiry_warning_days',
        'location',
        'device_id',
        'auto_sync_enabled',
        'auto_sync_interval',
        'last_sync_at',
        '_version',
        '_synced_at',
        'status',
        'suspension_reason',
        'show_retail_suggestions',
        'require_payment_account',
        'enabled_payment_methods',
        'online_store_enabled',
    ];

    protected $casts = [
        'enabled_payment_methods' => 'array',
        'require_payment_account' => 'boolean',
        'online_store_enabled' => 'boolean',
        'last_sync_at' => 'datetime',
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

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function sales()
    {
        return $this->hasManyThrough(Sale::class, User::class, 'store_id', 'cashier_id');
    }
}
