<?php

namespace App\Services\Sync;

use App\Services\Admin\Concerns\ResolvesDeviceLabels;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pullrowmapper */
class PullRowMapper
{
    use ResolvesDeviceLabels;

    public function mapPullRowForClient($item, string $table): array
    {
        $array = $item->toArray();
        $array['_deleted'] = (\method_exists($item, 'trashed') && $item->trashed()) ? 1 : 0;

        if ($table === 'purchase_orders' && ! empty($array['editing_device_id'])) {
            $array['editing_device_label'] = $this->deviceLabel($array['store_id'] ?? null, $array['editing_device_id'])
                ?? ($array['editing_device_label'] ?? null);
        }

        if ($table === 'stores') {
            $plan = 'free';
            $expiry = null;
            $isTrial = false;
            if ($item->user) {
                $sub = app(\App\Services\SubscriptionService::class)->resolveEffectiveSubscription($item->user);
                if ($sub) {
                    $plan = $sub->plan_name;
                    $expiry = $sub->end_date;
                    $isTrial = $sub->is_trial;
                }
            }
            $array['subscription_tier'] = $plan;
            if (($plan !== 'free' || $isTrial) && ! empty($expiry)) {
                $array['license_token'] = json_encode([
                    'tier' => $plan,
                    'expiry' => \Carbon\Carbon::parse($expiry)->toIso8601String(),
                    'is_trial' => (bool) $isTrial,
                ]);
            } else {
                $array['license_token'] = null;
            }
        }

        if ($table === 'users') {
            $array['pin'] = $item->getAttribute('pin');
            if (empty($array['username'])) {
                $array['username'] = $array['email'] ?: 'user_'.substr($array['id'], 0, 8);
            }
            if (! isset($array['name']) && isset($array['first_name'])) {
                $array['name'] = trim(($array['first_name'] ?? '').' '.($array['last_name'] ?? ''));
            }
        }

        if ($table === 'sales' && isset($array['cashier_id'])) {
            $array['user_id'] = $array['cashier_id'];
        }

        if ($table === 'purchase_orders') {
            if (isset($array['supplier_id'])) {
                $array['vendor_id'] = $array['supplier_id'];
            }
            if (isset($array['ordered_by'])) {
                $array['user_id'] = $array['ordered_by'];
            }
        }

        if ($table === 'purchase_order_items') {
            if (isset($array['purchase_order_id'])) {
                $array['po_id'] = $array['purchase_order_id'];
            }
            if (isset($array['total_cost'])) {
                $array['subtotal'] = $array['total_cost'];
            }
            if (isset($array['quantity_ordered'])) {
                $array['bulk_quantity'] = $array['quantity_ordered'];
                $array['units_per_bulk'] = 1;
            }
        }

        return $array;
    }
}
