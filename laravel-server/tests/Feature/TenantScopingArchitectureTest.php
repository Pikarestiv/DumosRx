<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Guards against the recurring failure pattern documented in
 * docs/KNOWN_BUGS.md's Executive Summary: every Critical/High finding in
 * the 2026-09-24 review had the same shape - a tenant-scoping fix applied
 * to one controller but not mirrored onto a structurally identical sibling
 * (ProductController's fix vs StockBatchController/StockMovementController/
 * PurchaseOrderController, all initially missing it; the same pattern
 * resurfaced in ActivityLogController, found while writing this test).
 *
 * Asserts every controller under Api/*, Api/App/* and Api/Web/* that
 * references a tenant-owned model either uses the ScopesToTenant trait, or
 * is named on the explicit ALLOWED_WITHOUT_TRAIT list below with a reason
 * why its own scoping is genuinely equivalent. Deliberately a lightweight
 * source-text scan, not a full static analyzer or AST walk: good enough to
 * catch "this controller queries Product but never scopes it," which is
 * exactly the shape every real bug in this class has had so far.
 */
class TenantScopingArchitectureTest extends TestCase
{
    /**
     * Eloquent models representing tenant/store-owned business data -
     * touching one of these without scoping it is how every real bug in
     * this class has looked. Keep in sync with new tenant-owned models
     * (app/Models/*.php that carry a user_id or store_id tenant column).
     */
    private const TENANT_OWNED_MODELS = [
        'Product', 'Category', 'Supplier', 'Customer', 'CustomerPayment',
        'StockBatch', 'StockMovement', 'StockAudit',
        'PurchaseOrder', 'PurchaseOrderItem', 'SupplierPayment',
        'Sale', 'SaleItem', 'SaleItemBatch', 'SaleReturn', 'SaleReturnItem',
        'Prescription', 'PrescriptionItem',
        'Expense', 'RequestedProduct', 'HeldTransaction',
        'LoyaltyTier', 'LoyaltyRedemptionOption', 'LoyaltyTransaction',
        'ActivityLog', 'OnlineOrder', 'OnlineOrderItem',
    ];

    /**
     * Controllers that legitimately touch tenant-owned models without the
     * ScopesToTenant trait, because they resolve the same tenant-owner-id
     * concept through their own equivalent (and independently reviewed)
     * logic instead - not a gap, just a different code path to the same
     * guarantee. Add here ONLY after confirming the controller's own
     * scoping is genuinely equivalent, with a one-line reason - this list
     * is the one place a real gap could hide again, so keep it short.
     */
    private const ALLOWED_WITHOUT_TRAIT = [
        // Resolves its own tenant id inline ($user->store_id ? Store::find()
        // : Store::where('user_id', $user->id)->first(), then ?->user_id)
        // and scopes every Product/StockBatch/Sale query through it -
        // predates ScopesToTenant, functionally equivalent.
        'SaleController',
        // applyPullTenantScope()'s per-table switch is intentionally more
        // granular than tenantOwnerId() alone can express: most tables are
        // now store_id-scoped directly, a handful of legacy ones still fall
        // back to the resolved owner's user_id in the switch's `default`.
        'SyncController',
        // index()'s non-super_admin branch deliberately scopes ActivityLog
        // to the CALLER's own user_id, not the whole tenant/store - "regular
        // users only see their own non-technical activities" per its own
        // comment, unlike ActivityLogController's "owner + all staff". Not a
        // gap: narrower-than-tenant scoping is the actual intended behavior
        // here, so ScopesToTenant's owner-wide resolution doesn't apply.
        'NotificationController',
    ];

    public function test_every_controller_touching_tenant_owned_models_uses_scopes_to_tenant(): void
    {
        $violations = [];

        foreach ($this->controllerFiles() as $path) {
            $contents = file_get_contents($path);
            $className = $this->classNameFromFile($contents);
            if ($className === null) {
                continue;
            }

            if (! $this->referencesAnyTenantModel($contents)) {
                continue;
            }

            if (in_array($className, self::ALLOWED_WITHOUT_TRAIT, true)) {
                continue;
            }

            $fqcn = $this->fqcnFromPath($path);
            if (! class_exists($fqcn)) {
                $violations[] = "{$className}: couldn't load {$fqcn} to verify its traits";

                continue;
            }

            if (! in_array(
                \App\Http\Controllers\Concerns\ScopesToTenant::class,
                class_uses_recursive($fqcn),
                true,
            )) {
                $violations[] = "{$className} references a tenant-owned model but doesn't use ScopesToTenant "
                    .'(and isn\'t on TenantScopingArchitectureTest::ALLOWED_WITHOUT_TRAIT)';
            }
        }

        $this->assertEmpty(
            $violations,
            "Tenant-scoping architecture violation(s):\n- ".implode("\n- ", $violations)
                ."\n\nEvery controller under Api/*, Api/App/* and Api/Web/* that queries a tenant-owned model "
                .'must use ScopesToTenant, or be added to TenantScopingArchitectureTest::ALLOWED_WITHOUT_TRAIT '
                ."with a documented reason its own scoping is equivalent.\n"
                .'See docs/KNOWN_BUGS.md\'s Recommended Engineering Improvements.',
        );
    }

    /** @return string[] absolute paths to every controller file in scope */
    private function controllerFiles(): array
    {
        $dirs = [
            app_path('Http/Controllers/Api'),
            app_path('Http/Controllers/Api/App'),
            app_path('Http/Controllers/Api/Web'),
        ];

        $files = [];
        foreach ($dirs as $dir) {
            foreach (glob($dir.'/*.php') ?: [] as $file) {
                $files[] = $file;
            }
        }
        sort($files);

        return $files;
    }

    private function referencesAnyTenantModel(string $contents): bool
    {
        foreach (self::TENANT_OWNED_MODELS as $model) {
            if (preg_match('/\b'.preg_quote($model, '/').'::/', $contents) === 1) {
                return true;
            }
        }

        return false;
    }

    private function classNameFromFile(string $contents): ?string
    {
        return preg_match('/^class\s+(\w+)/m', $contents, $matches) === 1 ? $matches[1] : null;
    }

    private function fqcnFromPath(string $path): string
    {
        $relative = str_replace(app_path().DIRECTORY_SEPARATOR, '', $path);
        $relative = str_replace('.php', '', $relative);
        $relative = str_replace(DIRECTORY_SEPARATOR, '\\', $relative);

        return 'App\\'.$relative;
    }
}
