<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
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
        'tax_number',
        'logo_url',
        'receipt_header',
        'receipt_footer',
        'receipt_tagline',
        'show_logo_on_receipt',
        'receipt_logo_position',
        'show_contact_on_receipt',
        'show_phone_on_receipt',
        'show_address_on_receipt',
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
        'require_sale_notes',
        'display_stock_levels',
        'uppercase_display_enabled',
        'reseller_commission_percentage',
        'loyalty_points_per_currency',
        'loyalty_defaults_seeded_at',
    ];

    protected $casts = [
        'enabled_payment_methods' => 'array',
        'custom_units' => 'array',
        'require_payment_account' => 'boolean',
        'online_store_enabled' => 'boolean',
        'is_demo' => 'boolean',
        'require_sale_notes' => 'boolean',
        'display_stock_levels' => 'boolean',
        'uppercase_display_enabled' => 'boolean',
        'last_sync_at' => 'datetime',
        '_synced_at' => 'datetime',
        'loyalty_defaults_seeded_at' => 'datetime',
        'store_slug_changed_at' => 'datetime',
        'storefront_dirty_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });

        // Slug-change cooldown: once every 6 months, otherwise contact
        // support. The client's Settings UI already disables the field
        // during the cooldown window using the same store_slug_changed_at
        // this stamps - this is the server-side backstop against a stale
        // UI or a direct API call. Reverts just the slug attribute (not
        // the whole save) so any other legitimate field changes bundled in
        // the same request/sync push still go through normally. The
        // first-ever slug set (no prior value) is never restricted.
        static::saving(function ($model) {
            if (!$model->isDirty('store_slug')) {
                return;
            }

            $previousSlug = $model->getOriginal('store_slug');
            $isFirstTimeSet = empty($previousSlug);
            $lastChanged = $model->getOriginal('store_slug_changed_at');

            if (!$isFirstTimeSet && $lastChanged && now()->diffInMonths($lastChanged) < 6) {
                $model->store_slug = $previousSlug;
                return;
            }

            if (!$isFirstTimeSet) {
                $model->store_slug_changed_at = now();
            }
        });

        // Debounced storefront rebuild trigger: stamps a dirty flag rather
        // than firing GitHub's repository_dispatch API directly from here,
        // so three toggles in two minutes (on/off/on) queue one rebuild via
        // the scheduled command (RebuildStorefrontIfDirty) instead of
        // three. A raw DB write (not another ->save()) avoids re-firing
        // these same boot events.
        static::saved(function ($model) {
            if ($model->wasChanged(['online_store_enabled', 'store_slug'])) {
                DB::table('stores')->where('id', $model->id)->update([
                    'storefront_dirty_at' => now(),
                ]);
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
