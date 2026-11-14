<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorefrontCheckoutRequest;
use App\Http\Resources\StorefrontProductResource;
use App\Support\StorefrontLocales;
use App\Models\Store;
use App\Services\Payment\PaymentService;
use App\Services\Storefront\StorefrontCatalogService;
use App\Services\Storefront\StorefrontCheckoutService;
use App\Services\Storefront\StorefrontInteractionService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    public const MAX_STOREFRONT_PRODUCTS = StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS;

    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
        private readonly StorefrontCheckoutService $checkoutService,
        private readonly StorefrontInteractionService $interactionService,
    ) {}

    #[OA\Get(
        path: '/storefront-slugs',
        summary: 'List published storefront slugs for static export prerendering',
        tags: ['Storefront'],
        responses: [
            new OA\Response(response: 200, description: 'Slug list', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'slugs', type: 'array', items: new OA\Items(type: 'string')),
            ])),
        ],
    )]
    public function slugs()
    {
        return response()->json([
            'slugs' => $this->catalogService->getPublishedSlugs(),
        ]);
    }

    #[OA\Get(
        path: '/storefront/{store_slug}',
        summary: 'Fetch public storefront details and initial products',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Storefront details', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'storefront', type: 'object'),
                new OA\Property(property: 'branches', type: 'array', items: new OA\Items(type: 'object')),
                new OA\Property(property: 'selected_branch', type: 'object'),
                new OA\Property(property: 'store', type: 'object'),
                new OA\Property(property: 'products', type: 'array', description: 'First MAX_STOREFRONT_PRODUCTS (50) listed products, in-stock first', items: new OA\Items(ref: '#/components/schemas/StorefrontProduct')),
                new OA\Property(property: 'product_count', type: 'integer', description: 'Total online-visible products on this branch, uncapped'),
                new OA\Property(property: 'online_payment_available', type: 'boolean'),
            ])),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show($store_slug, Request $request)
    {
        $storefront = $this->catalogService->resolveStorefront($store_slug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branches = $this->catalogService->getStorefrontBranches($storefront);
        $branch = $this->catalogService->resolveBranch(
            $storefront,
            $request->input('branch') ?? $request->input('branch_id'),
            $store_slug,
        );

        if (! $branch) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        if ($branch->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $products = $this->catalogService->getLandingProducts($branch);
        $currency = $this->catalogService->storeCurrency($branch);

        $branchData = [
            'id' => $branch->id,
            'name' => $branch->name,
            'store_slug' => $branch->store_slug,
            'location' => $branch->location,
            'address' => $branch->address,
            'phone' => $branch->phone,
            'email' => $branch->email,
            'store_type' => $branch->store_type ?? 'pharmacy',
            'currency' => $currency,
            'online_payment_available' => (bool) $branch->paystack_subaccount_code,
        ];

        return response()->json([
            'storefront' => [
                'id' => $storefront->id,
                'slug' => $storefront->slug,
                'name' => $storefront->name,
                'headline' => $storefront->headline,
                'about' => $storefront->about,
                'theme' => $storefront->theme ?? 'emerald',
                'locale' => $storefront->locale ?? StorefrontLocales::DEFAULT,
                'enabled_locales' => $storefront->enabled_locales ?? [$storefront->locale ?? StorefrontLocales::DEFAULT],
                'accent' => $storefront->accent,
                'tagline' => $storefront->tagline,
                'whatsapp' => $storefront->whatsapp,
                'pickup_minutes' => $storefront->pickup_minutes,
                'opening_hours' => $storefront->opening_hours,
                'logo_url' => $storefront->logo_url ?? $branch->logo_url,
                'banner_url' => $storefront->banner_url,
            ],
            'branches' => $branches->map(fn (Store $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'location' => $b->location,
                'address' => $b->address,
                'phone' => $b->phone,
                'is_primary' => $b->id === $storefront->primary_store_id,
            ])->values()->all(),
            'selected_branch' => $branchData,
            'store' => $branchData,
            'products' => StorefrontProductResource::collection($products),
            'product_count' => $this->catalogService->storeProducts($branch)->count(),
            'online_payment_available' => (bool) $branch->paystack_subaccount_code,
        ]);
    }

    #[OA\Get(
        path: '/storefront/{store_slug}/products',
        summary: 'Paginated public product catalog with search and category filters',
        tags: ['Storefront'],
        parameters: [
            new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'q', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'category', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'branch', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'page', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'per_page', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Paginated product list with category facets'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function products($store_slug, Request $request)
    {
        $storefront = $this->catalogService->resolveStorefront($store_slug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branches = $this->catalogService->getStorefrontBranches($storefront);
        $branch = $this->catalogService->resolveBranch(
            $storefront,
            $request->input('branch') ?? $request->input('branch_id'),
            $store_slug,
        );

        if (! $branch) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        if ($branch->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $search = $request->input('q');
        $category = $request->input('category');
        $perPage = (int) $request->input('per_page', StorefrontCatalogService::PER_PAGE);

        $paginated = $this->catalogService->paginateProducts($branch, $search, $category, $perPage);
        $categories = $this->catalogService->getStoreCategories($branch);
        $currency = $this->catalogService->storeCurrency($branch);

        $branchData = [
            'id' => $branch->id,
            'name' => $branch->name,
            'currency' => $currency,
            'online_payment_available' => (bool) $branch->paystack_subaccount_code,
        ];

        return StorefrontProductResource::collection($paginated)->additional([
            'categories' => $categories,
            'store' => $branchData,
            'selected_branch' => $branchData,
            'branches' => $branches->map(fn (Store $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'location' => $b->location,
                'is_primary' => $b->id === $storefront->primary_store_id,
            ])->values()->all(),
        ]);
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout/initialize',
        summary: 'Initialize Paystack online payment for storefront order',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(properties: [
            new OA\Property(property: 'customer_email', type: 'string'),
            new OA\Property(property: 'branch_id', type: 'string', nullable: true),
            new OA\Property(property: 'items', type: 'array', items: new OA\Items(properties: [
                new OA\Property(property: 'product_id', type: 'string'),
                new OA\Property(property: 'quantity', type: 'integer'),
            ])),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Payment transaction initialized'),
            new OA\Response(response: 422, description: 'Store unable to take online payments or item out of stock'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function initializeCheckout(
        Request $request,
        $store_slug,
        PaymentService $paymentService,
    ) {
        $storefront = $this->catalogService->resolveStorefront($store_slug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branch = $this->catalogService->resolveBranch(
            $storefront,
            $request->input('branch_id') ?? $request->input('branch'),
            $store_slug,
        );

        if (! $branch) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        if ($branch->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_email' => 'required|email|max:255',
            'branch_id' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        return $this->checkoutService->initializePayment(
            $branch,
            $validated,
            $paymentService,
        );
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout',
        summary: 'Place storefront order (in_store, transfer, or paystack confirm)',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(properties: [
            new OA\Property(property: 'customer_name', type: 'string'),
            new OA\Property(property: 'customer_phone', type: 'string'),
            new OA\Property(property: 'customer_address', type: 'string', nullable: true),
            new OA\Property(property: 'payment_method', type: 'string', enum: ['in_store', 'transfer', 'paystack']),
            new OA\Property(property: 'paystack_reference', type: 'string', nullable: true),
            new OA\Property(property: 'branch_id', type: 'string', nullable: true),
            new OA\Property(property: 'items', type: 'array', items: new OA\Items(properties: [
                new OA\Property(property: 'product_id', type: 'string'),
                new OA\Property(property: 'quantity', type: 'integer'),
            ])),
        ])),
        responses: [
            new OA\Response(response: 201, description: 'Order placed successfully'),
            new OA\Response(response: 422, description: 'Validation or payment error'),
            new OA\Response(response: 503, description: 'Payment verification unreachable'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function checkout(
        Request $request,
        $store_slug,
        PaymentService $paymentService,
    ) {
        $storefront = $this->catalogService->resolveStorefront($store_slug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $branch = $this->catalogService->resolveBranch(
            $storefront,
            $request->input('branch_id') ?? $request->input('branch'),
            $store_slug,
        );

        if (! $branch) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        if ($branch->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($branch)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:50',
            'customer_address' => 'nullable|string|max:1000',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => [
                'required_if:payment_method,paystack',
                'nullable',
                'string',
                'prohibited_unless:payment_method,paystack',
            ],
            'branch_id' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        return $this->checkoutService->placeOrder(
            $branch,
            $validated,
            $paymentService,
        );
    }

    public function trackOrder($store_slug, $identifier)
    {
        return $this->interactionService->trackOrder($store_slug, $identifier);
    }

    public function uploadPrescription($store_slug, Request $request)
    {
        return $this->interactionService->uploadPrescription($store_slug, $request);
    }
}
