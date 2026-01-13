<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Medicine extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name', 'generic_name', 'brand_name', 'category_id', 'manufacturer',
        'supplier_id', 'nafdac_number', 'dosage_form', 'strength', 'pack_size',
        'unit_of_measure', 'description', 'indications', 'contraindications',
        'side_effects', 'storage_conditions', 'requires_prescription',
        'is_controlled', 'is_active', 'cost_price', 'selling_price',
        'markup_percentage', 'barcode'
    ];

    protected $casts = [
        'requires_prescription' => 'boolean',
        'is_controlled' => 'boolean',
        'is_active' => 'boolean',
        'cost_price' => 'decimal:2',
        'selling_price' => 'decimal:2',
        'markup_percentage' => 'decimal:2',
    ];

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function inventory()
    {
        return $this->hasMany(Inventory::class);
    }
}
