<?php

namespace App\Services\Sync;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Clamps a 'refunded' sale to 'partially_refunded' while any service line still has units left unreturned.
 * Retire once no active device reports an X-App-Version < 0.0.42; see laravel-server/AGENTS.md. */
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
            ->get(['id', 'quantity']);

        if ($saleServices->isEmpty()) {
            return $payload;
        }

        $lines = DB::table('return_services')
            ->whereIn('sale_service_id', $saleServices->pluck('id'))
            ->where('_deleted', 0)
            ->get(['id', 'sale_service_id', 'quantity'])
            ->keyBy('id')
            ->map(fn ($line) => (array) $line)
            ->all();

        foreach ($request->input('changes', []) as $change) {
            $line = $change['payload'] ?? [];
            if (($change['table_name'] ?? '') === 'return_services' && ($change['operation'] ?? '') === 'INSERT' && ! empty($line['sale_service_id'])) {
                $lines[$line['id'] ?? $change['record_id'] ?? uniqid()] = $line;
            }
        }

        $returned = [];
        foreach ($lines as $line) {
            $returned[$line['sale_service_id']] = ($returned[$line['sale_service_id']] ?? 0) + (int) ($line['quantity'] ?? 1);
        }

        $hasUnrefundedServices = $saleServices->contains(
            fn ($svc) => ($returned[$svc->id] ?? 0) < (int) $svc->quantity
        );

        if ($hasUnrefundedServices) {
            $payload['payment_status'] = 'partially_refunded';
        }

        return $payload;
    }
}
