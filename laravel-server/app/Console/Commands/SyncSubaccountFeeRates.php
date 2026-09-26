<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Services\AdminAlertService;
use App\Services\Payment\PaystackSubaccountService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Propagates a changed storefront_platform_fee_percentage to every existing
 * subaccount - Paystack bakes percentage_charge in at subaccount-creation
 * time, so a superadmin editing the platform-wide rate does nothing to
 * subaccounts that already exist unless something calls the update-fee
 * endpoint per store. Mirrors RebuildStorefrontIfDirty's dirty-flag/schedule
 * shape exactly: no queue worker runs in production, so this must not be a
 * queued job.
 */
class SyncSubaccountFeeRates extends Command
{
    /** After this many consecutive failures for one store, escalate via
     * AdminAlertService rather than retrying silently forever. */
    private const FAILURE_ALERT_THRESHOLD = 5;

    protected $signature = 'storefront:sync-subaccount-fees';

    protected $description = 'Push the current platform fee percentage to every store whose Paystack subaccount is out of date.';

    public function handle(PaystackSubaccountService $paystack, AdminAlertService $alerts)
    {
        $feePercentage = (float) SystemConfig::getVal('storefront_platform_fee_percentage', 2.0);

        $dirtyStores = Store::whereNotNull('paystack_subaccount_code')
            ->whereNotNull('paystack_fee_dirty_at')
            ->get();

        if ($dirtyStores->isEmpty()) {
            $this->info('No subaccounts need a fee update.');
            return;
        }

        foreach ($dirtyStores as $store) {
            $failureCountKey = "subaccount_fee_failures:{$store->id}";

            try {
                $paystack->updateSubaccountFee($store->paystack_subaccount_code, $feePercentage);

                DB::table('stores')->where('id', $store->id)->update(['paystack_fee_dirty_at' => null]);

                SystemConfig::setVal($failureCountKey, 0);
            } catch (\Throwable $e) {
                Log::warning("Failed to sync Paystack fee for store {$store->id}: " . $e->getMessage());

                $failures = (int) SystemConfig::getVal($failureCountKey, 0) + 1;
                SystemConfig::setVal($failureCountKey, $failures);

                if ($failures >= self::FAILURE_ALERT_THRESHOLD) {
                    $alerts->send(
                        'Storefront subaccount fee sync repeatedly failing',
                        ["Store {$store->id} ({$store->name}) has failed {$failures} consecutive fee-sync attempts. Last error: " . $e->getMessage()],
                    );
                }
                // Deliberately left dirty - retried next scheduled run.
            }
        }

        $this->info("Fee sync attempted for {$dirtyStores->count()} store(s).");
    }
}
