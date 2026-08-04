<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperPrescription
 */
class Prescription extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'prescription_date' => 'date',
        'issued_at' => 'datetime',
        'dispensed_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (!$model->prescription_number) {
                 $model->prescription_number = 'RX' . date('Ymd') . rand(1000, 9999);
            }
        });
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function items()
    {
        return $this->hasMany(PrescriptionItem::class);
    }
}
