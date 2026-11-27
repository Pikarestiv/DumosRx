<?php

namespace App\Services\Storefront;

use App\Models\Store;
use App\Models\Storefront;
use App\Support\StorefrontLocales;
use App\Support\StoreTypes;
use Illuminate\Support\Collection;

/** The public storefront payload, with the owner's plan applied at read time (laravel-server/AGENTS.md, "Storefront plan entitlements"). */
class StorefrontPresenter
{
    public function __construct(
        private readonly StorefrontEntitlements $entitlements,
        private readonly StorefrontBranchSlugs $branchSlugs,
    ) {}

    /**
     * @param  array<string, mixed>  $entitlements
     * @return array<string, mixed>
     */
    public function profile(Storefront $storefront, Store $branch, array $entitlements): array
    {
        $locale = $storefront->locale ?? StorefrontLocales::DEFAULT;

        return [
            'id' => $storefront->id,
            'slug' => $storefront->slug,
            'name' => $storefront->name,
            'headline' => $storefront->headline,
            'about' => $storefront->about,
            'theme' => $this->entitlements->effectiveTheme($storefront->theme, $entitlements),
            'locale' => $locale,
            'enabled_locales' => $entitlements['visitor_language_switch'] ? ($storefront->enabled_locales ?? [$locale]) : [$locale],
            'accent' => $entitlements['custom_accent_colour'] ? $storefront->accent : null,
            'tagline' => $storefront->tagline,
            'whatsapp' => $entitlements['checkout_whatsapp'] ? $storefront->whatsapp : null,
            'pickup_minutes' => $storefront->pickup_minutes,
            'payment_instructions' => $entitlements['checkout_transfer_mobile_money'] ? $storefront->payment_instructions : null,
            'delivery_available' => (bool) $storefront->delivery_available,
            'delivery_note' => $storefront->delivery_note,
            'pay_on_delivery' => (bool) $storefront->pay_on_delivery,
            'show_services' => $this->showsServices($storefront, $entitlements),
            'show_powered_by' => ! $entitlements['remove_powered_by_badge'],
            'opening_hours' => $storefront->opening_hours,
            'logo_url' => $storefront->logo_url ?? $branch->logo_url,
            'banner_url' => $storefront->banner_url,
        ];
    }

    /**
     * @param  array<string, mixed>  $entitlements
     */
    public function showsServices(Storefront $storefront, array $entitlements): bool
    {
        return $entitlements['services_on_storefront'] && $storefront->show_services;
    }

    /**
     * @param  array<string, mixed>  $entitlements
     */
    public function onlinePaymentAvailable(Store $branch, array $entitlements): bool
    {
        return $entitlements['checkout_paystack'] && (bool) $branch->paystack_subaccount_code;
    }

    /**
     * @param  array<string, mixed>  $entitlements
     */
    public function checkoutWarning(Storefront $storefront, array $entitlements): ?string
    {
        $hasOtherMethod = filled($storefront->payment_instructions) || $storefront->pay_on_delivery;
        $usedOnlinePayment = Store::where('user_id', $storefront->user_id)->whereNotNull('paystack_subaccount_code')->exists();

        return ! $entitlements['checkout_paystack'] && $usedOnlinePayment && ! $hasOtherMethod
            ? 'Online card payments are not part of your plan, so customers can no longer pay online. Add bank transfer or mobile money instructions, or switch on pay on delivery, so customers still have a way to pay.'
            : null;
    }

    /**
     * @param  array<string, mixed>  $entitlements
     * @return array<string, mixed>
     */
    public function branchPayload(Store $branch, string $currency, array $entitlements): array
    {
        return [
            'id' => $branch->id,
            'name' => $branch->name,
            'store_slug' => $branch->store_slug,
            'branch_slug' => $this->branchSlugs->ensure($branch),
            'location' => $branch->location,
            'address' => $branch->address,
            'phone' => $branch->phone,
            'email' => $branch->email,
            'store_type' => StoreTypes::normalize($branch->store_type),
            'currency' => $currency,
            'online_payment_available' => $this->onlinePaymentAvailable($branch, $entitlements),
            'timezone' => $branch->timezone,
        ];
    }

    /**
     * @param  Collection<int, Store>  $branches
     * @return array<int, array<string, mixed>>
     */
    public function branchSummaries(Storefront $storefront, Collection $branches, bool $detailed = true): array
    {
        $slugs = $this->branchSlugs->forBranches($branches);

        return $branches->map(fn (Store $b) => [
            'id' => $b->id,
            'name' => $b->name,
            'slug' => $slugs[$b->id],
            'location' => $b->location,
            ...($detailed ? ['address' => $b->address, 'phone' => $b->phone] : []),
            'is_primary' => $b->id === $storefront->primary_store_id,
        ])->values()->all();
    }
}
