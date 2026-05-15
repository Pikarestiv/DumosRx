<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use App\Services\Admin\AdminService;
use Illuminate\Http\Request;

class AdminController extends Controller
{
    protected $adminService;

    public function __construct(AdminService $adminService)
    {
        $this->adminService = $adminService;
    }

    public function summary(Request $request)
    {
        // Ensure only super_admin can access
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $summary = $this->adminService->getGlobalSummary();
            return response()->json($summary);
        } catch (\Exception $e) {
            \Log::error("Admin Dashboard Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch admin summary'], 500);
        }
    }

    public function pharmacies(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $data = $this->adminService->getPharmacies($page, $search);
            return response()->json($data);
        } catch (\Exception $e) {
            \Log::error("Admin Pharmacies Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch pharmacies'], 500);
        }
    }

    public function registerPharmacy(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'pharmacy_name' => 'required|string|min:2',
            'first_name' => 'required|string|min:2',
            'last_name' => 'required|string|min:2',
            'email' => 'required|email|unique:users,email',
            'phone' => 'required|string|min:10',
            'password' => 'required|string|min:8',
        ]);

        try {
            $pharmacy = $this->adminService->registerPharmacy($validated);
            return response()->json([
                'message' => 'Pharmacy registered successfully',
                'pharmacy' => $pharmacy
            ], 201);
        } catch (\Exception $e) {
            \Log::error("Admin Register Pharmacy Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to register pharmacy'], 500);
        }
    }

    public function products(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $page = $request->get('page', 1);
        $search = $request->get('search');
        $category = $request->get('category');
        
        return response()->json([
            'products' => $this->adminService->getGlobalProducts($page, $search, $category),
            'metrics' => $this->adminService->getProductMetrics(),
            'categories' => Medicine::select('generic_name')
                ->whereNotNull('generic_name')
                ->distinct()
                ->pluck('generic_name')
        ]);
    }

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
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $data = $this->adminService->getGlobalUsers($page, $search);
            return response()->json($data);
        } catch (\Exception $e) {
            \Log::error("Admin Users Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch users'], 500);
        }
    }

    public function search(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $query = $request->query('query');
            if (!$query) return response()->json([]);

            $results = $this->adminService->globalSearch($query);
            return response()->json($results);
        } catch (\Exception $e) {
            \Log::error("Admin Search Error: " . $e->getMessage());
            return response()->json(['error' => 'Search failed'], 500);
        }
    }
    public function suspendPharmacy(Request $request, $id)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->suspendPharmacy($id);
            return response()->json(['message' => 'Pharmacy suspended successfully']);
        } catch (\Exception $e) {
            \Log::error("Admin Suspend Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to suspend pharmacy'], 500);
        }
    }

    public function deactivateUser(Request $request, $id)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->deactivateUser($id);
            return response()->json(['message' => 'User deactivated successfully']);
        } catch (\Exception $e) {
            \Log::error("Admin Deactivate User Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to deactivate user'], 500);
        }
    }

    public function forcePasswordReset(Request $request, $id)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $result = $this->adminService->forcePasswordReset($id);
            return response()->json([
                'message' => 'Password reset forced successfully',
                'temp_password' => $result['temp_password']
            ]);
        } catch (\Exception $e) {
            \Log::error("Admin Force Reset Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to force password reset'], 500);
        }
    }

    public function notifyUser(Request $request, $id)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
        ]);

        try {
            $this->adminService->notifyUser($id, $validated['message'], $validated['title']);
            return response()->json(['message' => 'Notification sent successfully']);
        } catch (\Exception $e) {
            \Log::error("Admin Notify Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to send notification'], 500);
        }
    }

    public function bulkNotify(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
            'filters' => 'nullable|array'
        ]);

        try {
            $count = $this->adminService->bulkNotify($validated['filters'] ?? [], $validated['message'], $validated['title']);
            return response()->json([
                'message' => "Notification sent to {$count} users successfully",
                'count' => $count
            ]);
        } catch (\Exception $e) {
            \Log::error("Admin Bulk Notify Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to send bulk notifications'], 500);
        }
    }
}
