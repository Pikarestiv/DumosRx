<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Storefront extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'slug',
        'name',
        'headline',
        'about',
        'theme',
        'locale',
        'enabled_locales',
        'accent',
        'tagline',
        'whatsapp',
        'pickup_minutes',
        'opening_hours',
        'primary_store_id',
        'logo_url',
        'banner_url',
        'social_links',
        'is_active',
        'style_dirty_at',
    ];

    protected $casts = [
        'social_links' => 'array',
        'opening_hours' => 'array',
        'enabled_locales' => 'array',
        'pickup_minutes' => 'integer',
        'is_active' => 'boolean',
        'style_dirty_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
            if (! empty($model->slug)) {
                $model->slug = Str::slug($model->slug);
            }
        });

        static::updating(function ($model) {
            if ($model->isDirty('slug') && ! empty($model->slug)) {
                $model->slug = Str::slug($model->slug);
            }
        });
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function primaryStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'primary_store_id');
    }

    public function stores(): HasMany
    {
        return $this->hasMany(Store::class, 'user_id', 'user_id');
    }

    public function branches(): HasMany
    {
        return $this->stores()->where('online_store_enabled', true);
    }

    public static function clearStyleDirty(?\DateTimeInterface $cutoff = null): int
    {
        return static::query()
            ->whereNotNull('style_dirty_at')
            ->when($cutoff, fn ($q) => $q->where('style_dirty_at', '<=', $cutoff))
            ->update(['style_dirty_at' => null]);
    }
}
