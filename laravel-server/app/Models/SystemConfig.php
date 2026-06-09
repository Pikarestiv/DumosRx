<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SystemConfig extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'value',
        'description',
    ];

    protected $casts = [
        'value' => 'json',
    ];

    /**
     * Get a configuration value by key, optionally providing a default.
     */
    public static function getVal(string $key, $default = null)
    {
        return \Illuminate\Support\Facades\Cache::remember("system_config_{$key}", 3600, function () use ($key, $default) {
            $config = self::where('key', $key)->first();
            return $config !== null ? $config->value : $default;
        });
    }

    /**
     * Set a configuration value by key.
     */
    public static function setVal(string $key, $value, ?string $description = null)
    {
        $config = self::updateOrCreate(
            ['key' => $key],
            [
                'value' => $value,
                'description' => $description
            ]
        );

        \Illuminate\Support\Facades\Cache::forget("system_config_{$key}");

        return $config;
    }
}
