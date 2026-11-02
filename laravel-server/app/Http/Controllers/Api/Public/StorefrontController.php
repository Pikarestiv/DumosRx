<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\StorefrontProductResource;
use App\Models\Store;
use App\Services\Payment\PaymentService;
use App\Services\Storefront\StorefrontCatalogService;
use App\Services\Storefront\StorefrontCheckoutService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    public const MAX_STOREFRONT_PRODUCTS = StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS;

    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
        private readonly StorefrontCheckoutService $checkoutService,
    ) {}

    #[OA\Get(
        path: '/storefront-slugs',
        summary: 'List published storefront slugs for static site generation',
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
                new OA\Property(property: 'store', type: 'object'),
                new OA\Property(property: 'products', type: 'array', items: new OA\Items(ref: '#/components/schemas/StorefrontProduct')),
                new OA\Property(property: 'online_payment_available', type: 'boolean'),
            ])),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show($store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($store)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $products = $this->catalogService->getLandingProducts($store);

        return response()->json([
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'store_slug' => $store->store_slug,
                'location' => $store->location,
                'address' => $store->address,
                'phone' => $store->phone,
                'email' => $store->email,
                'logo_url' => $store->logo_url,
                'currency' => $this->catalogService->storeCurrency($store),
            ],
            'products' => StorefrontProductResource::collection($products),
            'online_payment_available' => (bool) $store->paystack_subaccount_code,
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
            new OA\Parameter(name: 'page', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'per_page', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Paginated products'),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function products(Request $request, $store_slug)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($store)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $search = $request->query('q');
        $categoryId = $request->query('category');
        $perPage = (int) $request->query('per_page', StorefrontCatalogService::PER_PAGE);

        $paginated = $this->catalogService->paginateProducts($store, $search, $categoryId, $perPage);
        $categories = $this->catalogService->getStoreCategories($store);

        $response = StorefrontProductResource::collection($paginated)->response()->getData(true);
        $response['categories'] = $categories;
        $response['store'] = [
            'id' => $store->id,
            'name' => $store->name,
            'currency' => $this->catalogService->storeCurrency($store),
        ];

        return response()->json($response);
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout/initialize',
        summary: 'Start an online (Paystack) storefront payment',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Payment session created'),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function initializeCheckout(Request $request, $store_slug, PaymentService $paymentService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($store)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_email' => 'required|email|max:255',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        return $this->checkoutService->initializePayment($store, $validated, $paymentService);
    }

    #[OA\Post(
        path: '/storefront/{store_slug}/checkout',
        summary: 'Place a public storefront order',
        tags: ['Storefront'],
        parameters: [new OA\Parameter(name: 'store_slug', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 201, description: 'Order placed'),
            new OA\Response(response: 403, description: 'Store is suspended'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function checkout(Request $request, $store_slug, PaymentService $paymentService)
    {
        $store = Store::where('store_slug', $store_slug)->firstOrFail();

        if ($store->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        if (! $this->catalogService->storefrontEnabled($store)) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $validated = $request->validate([
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:20',
            'customer_address' => 'nullable|string|max:1000',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => [
                'required_if:payment_method,paystack',
                'nullable',
                'string',
                'prohibited_unless:payment_method,paystack',
            ],
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        return $this->checkoutService->placeOrder($store, $validated, $paymentService);
    }
}
