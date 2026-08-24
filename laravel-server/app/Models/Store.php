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
        'registration_number',
        'logo_url',
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
        'is_demo',
        'show_retail_suggestions',
        'require_payment_account',
        'enabled_payment_methods',
        'online_store_enabled',
        'custom_units',
    ];

    protected $casts = [
        'enabled_payment_methods' => 'array',
        'custom_units' => 'array',
        'require_payment_account' => 'boolean',
        'online_store_enabled' => 'boolean',
        'is_demo' => 'boolean',
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

    /** Scoped by sales.store_id (populated by the client's sync engine on
     * every push, and by SyncController::pull's own scoping; see its
     * 'sales' => $query->whereIn('store_id', $storeIds) case), NOT by
     * reconstructing store membership through cashier_id/users.store_id.
     * That reconstruction misses a store owner's own sales entirely,
     * since an owner's own User row never gets store_id set to their own
     * store (only hired staff do; see StaffController::store). A store
     * owner ringing up their own sales showed zero revenue through the
     * old version of this relation.
     *
     * Caveat: sales synced before the store_id column existed
     * (2026-08-14, see add_store_id_to_domain_tables migration) may still
     * have store_id null on rows that haven't been touched since. Admin
     * reporting that needs to be correct across that boundary (see
     * AdminService::getStores()) falls back to the legacy cashier-based
     * match for those rows rather than relying on this relation alone.
     */
    public function sales()
    {
        return $this->hasMany(Sale::class);
    }
}
