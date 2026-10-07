<?php

namespace App\Services\Admin;

use App\Models\Product;
use Illuminate\Support\Facades\DB;

class AdminCatalogService
{
    public function getGlobalProducts($page = 1, $search = null, $category = null)
    {
        $query = Product::query();

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%")
                    ->orWhere('generic_name', 'like', "%{$search}%");
            });
        }

        if ($category && $category !== 'all') {
            $query->where('generic_name', $category);
        }

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($product) {
                $inventory = DB::table('stock_batches')->where('product_id', $product->id);
                $totalStock = $inventory->sum('quantity');
                $avgReorder = 10;
                if ($product->reorder_level) {
                    $avgReorder = $product->reorder_level;
                }

                $stockLevel = 'Empty';
                if ($totalStock > $avgReorder * 2) {
                    $stockLevel = 'High';
                } elseif ($totalStock > $avgReorder) {
                    $stockLevel = 'Medium';
                } elseif ($totalStock > 0) {
                    $stockLevel = 'Low';
                }

                $status = $product->is_active ? 'Active' : 'Inactive';
                $hasExpired = DB::table('stock_batches')
                    ->where('product_id', $product->id)
                    ->where('expiry_date', '<', now())
                    ->exists();
                if ($hasExpired) {
                    $status = 'Expired';
                }

                return [
                    'id' => $product->id,
                    'name' => $product->name,
                    'category' => $product->generic_name ?: 'General',
                    'instances' => $inventory->count(),
                    'avgPrice' => '₦'.number_format($product->selling_price ?: 0, 2),
                    'stockLevel' => $stockLevel,
                    'status' => $status,
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ];
    }

    public function getProductMetrics()
    {
        $totalProducts = Product::count();

        $mostStockedCategory = Product::select('generic_name', DB::raw('count(*) as total'))
            ->groupBy('generic_name')
            ->orderByDesc('total')
            ->first();

        $thisMonth = Product::whereYear('created_at', now()->year)
            ->whereMonth('created_at', now()->month)
            ->count();
        $lastMonth = Product::whereYear('created_at', now()->subMonth()->year)
            ->whereMonth('created_at', now()->subMonth()->month)
            ->count();
        $growth = $this->calculateChange($thisMonth, $lastMonth);

        $lowStockCount = DB::table('stock_batches')->where('quantity', '<', 10)->count();

        $compliantCount = Product::whereNotNull('nafdac_number')->where('nafdac_number', '!=', '')->count();
        $complianceRate = $totalProducts > 0 ? round(($compliantCount / $totalProducts) * 100, 1) : 0;

        return [
            'mostStockedCategory' => [
                'name' => $mostStockedCategory ? ($mostStockedCategory->generic_name ?: 'General') : 'None',
                'growth' => round($growth, 1).'%',
            ],
            'stockAlerts' => [
                'count' => $lowStockCount,
                'rate' => ($totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0).'%',
            ],
            'compliance' => [
                'rate' => $complianceRate.'%',
                'status' => $complianceRate > 90 ? 'Verified' : 'Action Required',
            ],
        ];
    }

    public function standardizeCatalog()
    {
        $updatedCount = 0;

        $updatedCount += Product::where(function ($q) {
            $q->whereNull('generic_name')->orWhere('generic_name', '');
        })->update(['generic_name' => 'General']);

        $updatedCount += Product::where(function ($q) {
            $q->whereNull('manufacturer')->orWhere('manufacturer', '');
        })->update(['manufacturer' => 'Unknown']);

        return [
            'count' => $updatedCount,
            'message' => "Successfully standardized {$updatedCount} catalog entries.",
        ];
    }

    private function calculateChange($current, $previous)
    {
        if ($previous == 0) {
            return $current > 0 ? 100 : 0;
        }

        return (($current - $previous) / $previous) * 100;
    }
}
