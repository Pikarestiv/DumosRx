<?php

$file = '/Users/admin/Documents/Projects/DumosRx/laravel-server/app/Services/Admin/AdminService.php';
$content = file_get_contents($file);

$newMethod = <<<'CODE'
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

    public function globalSearch($query)
CODE;

$newContent = str_replace('    public function globalSearch($query)', $newMethod, $content);
file_put_contents($file, $newContent);
echo "Successfully added standardizeCatalog to AdminService\n";
