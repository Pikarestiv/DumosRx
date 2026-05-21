<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Store extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'name',
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
}
