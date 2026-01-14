<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Prescription extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'prescription_number', 'customer_id', 'doctor_name', 'hospital_name',
        'prescription_date', 'diagnosis', 'notes', 'status', 
        'substituted_medicine_id', 'substitution_reason'
    ];

    protected $casts = [
        'prescription_date' => 'date',
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
