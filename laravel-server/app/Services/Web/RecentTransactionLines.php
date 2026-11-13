<?php

namespace App\Services\Web;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** A recent transaction's lines for the web dashboard: product lines, then service lines in the same shape. */
final class RecentTransactionLines
{
    public static function forSale(string $saleId): Collection
    {
        $products = DB::table('sale_items')
            ->where('sale_id', $saleId)
            ->leftJoin('products', 'sale_items.product_id', '=', 'products.id')
            ->select('sale_items.*', 'products.name as medicine_name', DB::raw("'product' as item_type"))
            ->get();

        $services = DB::table('sale_services')
            ->where('sale_id', $saleId)
            ->where('_deleted', 0)
            ->whereNull('deleted_at')
            ->select('id', 'sale_id', 'service_id', 'quantity', 'unit_price', 'total_price', 'service_name as medicine_name', DB::raw("'service' as item_type"))
            ->get();

        return $products->concat($services)->values();
    }
}
