<?php

$file = '/Users/admin/Documents/Projects/DumosRx/laravel-server/app/Http/Controllers/Api/Admin/AdminController.php';
$content = file_get_contents($file);

$newMethod = <<<'CODE'
    public function standardize(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $result = $this->adminService->standardizeCatalog();
            return response()->json($result);
        } catch (\Exception $e) {
            \Log::error("Admin Standardize Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to standardize catalog'], 500);
        }
    }

    public function users(Request $request)
CODE;

$newContent = str_replace('    public function users(Request $request)', $newMethod, $content);
file_put_contents($file, $newContent);
echo "Successfully added standardize to AdminController\n";
