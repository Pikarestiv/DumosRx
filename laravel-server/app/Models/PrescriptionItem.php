<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PrescriptionItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'prescription_id', 'medicine_id', 'dosage', 'quantity_prescribed',
        'quantity_dispensed', 'status'
    ];
}
