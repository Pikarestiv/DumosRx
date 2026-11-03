<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class StorefrontPrescription extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'storefront_id',
        'store_id',
        'prescription_number',
        'customer_name',
        'customer_phone',
        'file_path',
        'notes',
        'status',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
            if (empty($model->prescription_number)) {
                $model->prescription_number = 'RX-'.strtoupper(Str::random(8));
            }
        });
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function storefront(): BelongsTo
    {
        return $this->belongsTo(Storefront::class, 'storefront_id');
    }
}

