<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperPrescriptionItem
 */
class PrescriptionItem extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'prescription_id', 'product_name', 'strength', 'dosage', 'quantity',
        'instructions', 'cost',
        'refills_authorized', 'refills_used', 'refill_interval_days', 'next_refill_date'
    ];
}
