<?php

$file = '/Users/admin/Documents/Projects/DumosRx/laravel-server/app/Services/Admin/AdminService.php';
$content = file_get_contents($file);

$oldCode = <<<'CODE'
    public function standardizeCatalog()
    {
        // Find medicines without generic names or manufacturers
        $items = Medicine::whereNull('generic_name')
            ->orWhere('generic_name', '')
            ->orWhereNull('manufacturer')
            ->orWhere('manufacturer', '')
            ->get();

        foreach ($items as $item) {
            // Simple standardization: if generic_name is missing, try to use brand_name or name
            if (empty($item->generic_name)) {
                $item->generic_name = $item->brand_name ?: 'General';
            }
            
            if (empty($item->manufacturer)) {
                $item->manufacturer = 'Unknown';
            }
            
            $item->save();
        }

        return [
            'count' => $items->count(),
            'message' => "Standardized {$items->count()} catalog entries."
        ];
    }
CODE;

$newCode = <<<'CODE'
    public function standardizeCatalog()
    {
        $updatedCount = 0;
        
        // Standardize generic names
        $updatedCount += Medicine::where(function($q) {
            $q->whereNull('generic_name')->orWhere('generic_name', '');
        })->update(['generic_name' => 'General']);
            
        // Standardize manufacturers
        $updatedCount += Medicine::where(function($q) {
            $q->whereNull('manufacturer')->orWhere('manufacturer', '');
        })->update(['manufacturer' => 'Unknown']);

        return [
            'count' => $updatedCount,
            'message' => "Successfully standardized {$updatedCount} catalog entries."
        ];
    }
CODE;

$newContent = str_replace($oldCode, $newCode, $content);
file_put_contents($file, $newContent);
echo "Successfully updated standardizeCatalog in AdminService\n";
