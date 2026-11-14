<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Services\Storefront\StorefrontCatalogService;
use Illuminate\Http\JsonResponse;

class StorefrontServicesController extends Controller
{
    public function __construct(private readonly StorefrontCatalogService $catalogService) {}

    public function index(string $store_slug): JsonResponse
    {
        $storefront = $this->catalogService->resolveStorefront($store_slug);
        $branch = $storefront ? $this->catalogService->resolveBranch($storefront, request('branch'), $store_slug) : null;

        if (! $branch || $branch->isSuspended() || ! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        if (! $storefront->show_services) {
            return response()->json(['data' => []]);
        }

        $services = Service::where('store_id', $branch->id)
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('name')
            ->limit(200)
            ->get(['id', 'name', 'description', 'category', 'price']);

        return response()->json(['data' => $services->map(fn (Service $service) => [
            'id' => $service->id,
            'name' => $service->name,
            'description' => $service->description,
            'category' => $service->category,
            'price' => (float) $service->price,
        ])->values()]);
    }
}
