<?php

namespace App\Services\Sync;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Prevents older or partial clients from marking a sale as fully 'refunded'
 * when active unrefunded service lines (sale_services) still exist on the sale.
 * Retire once no active device reports an X-App-Version < 0.0.42; see laravel-server/AGENTS.md.
 */
final class LegacyServicesReturnGate
{
    public const INTRODUCED_IN = '0.0.42';

    public static function apply(array $payload, string $saleId, Request $request): array
    {
        if (($payload['payment_status'] ?? null) !== 'refunded') {
            return $payload;
        }

        $saleServices = DB::table('sale_services')
            ->where('sale_id', $saleId)
            ->where('_deleted', 0)
            ->get(['id']);

        if ($saleServices->isEmpty()) {
            return $payload;
        }

        $incomingReturnedServiceIds = collect($request->input('changes', []))
            ->filter(fn ($c) => ($c['table_name'] ?? '') === 'return_services' && ($c['operation'] ?? '') === 'INSERT')
            ->map(fn ($c) => $c['payload']['sale_service_id'] ?? null)
            ->filter()
            ->all();

        $dbReturnedServiceIds = DB::table('return_services')
            ->whereIn('sale_service_id', $saleServices->pluck('id'))
            ->where('_deleted', 0)
            ->pluck('sale_service_id')
            ->all();

        $allReturnedServiceIds = array_unique(array_merge($incomingReturnedServiceIds, $dbReturnedServiceIds));

        $hasUnrefundedServices = $saleServices->contains(
            fn ($svc) => ! in_array($svc->id, $allReturnedServiceIds, true)
        );

        if ($hasUnrefundedServices) {
            $payload['payment_status'] = 'partially_refunded';
        }

        return $payload;
    }
}

