<?php

namespace App\Support;

use Closure;
use Illuminate\Validation\Rule;

/**
 * Validation for the storefront's accent, details and languages, shared by the
 * admin endpoint (AdminStoreStorefrontController::updateSettings) and the store
 * owner's own (Api\App\StorefrontSettingsController) so the two cannot drift.
 */
final class StorefrontSettingsRules
{
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    private const CLOCK = '/^([01]\d|2[0-3]):[0-5]\d$/';

    /**
     * @return array<string, array<int, mixed>>
     */
    public static function rules(): array
    {
        return [
            'accent' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:140'],
            'whatsapp' => ['sometimes', 'nullable', 'string', 'regex:/^\+?[0-9 ()\-]{6,32}$/'],
            'pickup_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:1440'],
            'opening_hours' => ['sometimes', 'nullable', 'array', self::openingHours(...)],
            'locale' => ['sometimes', 'nullable', 'string', Rule::in(StorefrontLocales::IDS)],
            'enabled_locales' => ['sometimes', 'nullable', 'array', 'max:'.count(StorefrontLocales::IDS)],
            'enabled_locales.*' => ['string', 'distinct', Rule::in(StorefrontLocales::IDS)],
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function normalise(array $validated): array
    {
        if (isset($validated['accent'])) {
            $validated['accent'] = strtoupper($validated['accent']);
        }

        return $validated;
    }

    private static function openingHours(string $attribute, mixed $hours, Closure $fail): void
    {
        foreach ((array) $hours as $day => $range) {
            if (! in_array($day, self::WEEKDAYS, true)) {
                $fail("'{$day}' is not a weekday.");

                return;
            }
            if ($range === null) {
                continue;
            }
            $valid = is_array($range)
                && preg_match(self::CLOCK, (string) ($range['open'] ?? ''))
                && preg_match(self::CLOCK, (string) ($range['close'] ?? ''))
                && $range['open'] < $range['close'];
            if (! $valid) {
                $fail("The hours for {$day} must be HH:MM times with opening before closing.");

                return;
            }
        }
    }
}
