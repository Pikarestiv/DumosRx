<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
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

    public function products(Request $request)
    {
        if ($request->user()->role !== 'super_admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $data = $this->adminService->getGlobalProducts($page, $search);
            return response()->json($data);
        } catch (\Exception $e) {
            \Log::error("Admin Products Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch products'], 500);
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
}
