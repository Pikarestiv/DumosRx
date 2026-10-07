<?php

namespace App\Services\Admin;

use App\Support\CurrencyTotals;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminFleetMetricsService
{
    public function stockValueByCurrency(): array
    {
        if (! Schema::hasTable('stock_batches') || ! Schema::hasTable('products') || ! Schema::hasTable('stores')) {
            return [];
        }

        $query = DB::table('stock_batches')
            ->join('products', 'products.id', '=', 'stock_batches.product_id')
            ->join('stores', 'stores.id', '=', 'products.store_id')
            ->whereNull('stock_batches.deleted_at');

        if (Schema::hasColumn('products', 'deleted_at')) {
            $query->whereNull('products.deleted_at');
        }

        if (Schema::hasColumn('stores', 'deleted_at')) {
            $query->whereNull('stores.deleted_at');
        }

        $rows = $query
            ->groupBy('stores.currency')
            ->selectRaw('stores.currency as currency, COALESCE(SUM(stock_batches.quantity * stock_batches.cost_price), 0) as amount')
            ->get();

        return CurrencyTotals::fromPairs(
            $rows->map(fn ($row) => ['currency' => $row->currency, 'amount' => $row->amount])
        );
    }
}
