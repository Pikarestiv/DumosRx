<?php

$file = '/Users/admin/Documents/Projects/DumosRx/laravel-server/app/Services/Admin/AdminService.php';
$content = file_get_contents($file);

$oldCode = <<<'CODE'
    public function getProductMetrics()
    {
        $totalProducts = Medicine::count();

        // Find most stocked category
        $mostStockedCategory = Medicine::select('generic_name', DB::raw('count(*) as total'))
            ->groupBy('generic_name')
            ->orderByDesc('total')
            ->first();

        // Stock alerts (example logic)
        $lowStockCount = DB::table('inventory')->where('quantity_in_stock', '<', 10)->count();

        return [
            'mostStockedCategory' => [
                'name' => $mostStockedCategory ? ($mostStockedCategory->generic_name ?: 'General') : 'None',
                'growth' => '14.2%'
            ],
            'stockAlerts' => [
                'count' => $lowStockCount,
                'rate' => $totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0
            ],
            'compliance' => [
                'rate' => '98%',
                'status' => 'Verified'
            ]
        ];
    }
CODE;

$newCode = <<<'CODE'
    public function getProductMetrics()
    {
        $totalProducts = Medicine::count();

        // Find most stocked category
        $mostStockedCategory = Medicine::select('generic_name', DB::raw('count(*) as total'))
            ->groupBy('generic_name')
            ->orderByDesc('total')
            ->first();

        // Calculate Growth
        $thisMonth = Medicine::whereMonth('created_at', now()->month)->count();
        $lastMonth = Medicine::whereMonth('created_at', now()->subMonth()->month)->count();
        $growth = $this->calculateChange($thisMonth, $lastMonth);

        // Stock alerts
        $lowStockCount = DB::table('inventory')->where('quantity_in_stock', '<', 10)->count();

        // PCN Compliance
        $compliantCount = Medicine::whereNotNull('nafdac_number')->where('nafdac_number', '!=', '')->count();
        $complianceRate = $totalProducts > 0 ? round(($compliantCount / $totalProducts) * 100, 1) : 0;

        return [
            'mostStockedCategory' => [
                'name' => $mostStockedCategory ? ($mostStockedCategory->generic_name ?: 'General') : 'None',
                'growth' => round($growth, 1) . '%'
            ],
            'stockAlerts' => [
                'count' => $lowStockCount,
                'rate' => $totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0
            ],
            'compliance' => [
                'rate' => $complianceRate . '%',
                'status' => $complianceRate > 90 ? 'Verified' : 'Action Required'
            ]
        ];
    }
CODE;

$newContent = str_replace($oldCode, $newCode, $content);
file_put_contents($file, $newContent);
echo "Successfully updated AdminService\n";
