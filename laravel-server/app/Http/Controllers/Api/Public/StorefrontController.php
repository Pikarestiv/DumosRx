<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\StorefrontProductResource;
use App\Models\Store;
use App\Models\Storefront;
use App\Services\Payment\PaymentService;
use App\Services\Storefront\StorefrontBranchDirectory;
use App\Services\Storefront\StorefrontCatalogService;
use App\Services\Storefront\StorefrontCheckoutService;
use App\Services\Storefront\StorefrontEntitlements;
use App\Services\Storefront\StorefrontInteractionService;
use App\Services\Storefront\StorefrontPresenter;
use App\Support\StorefrontCheckoutRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontController extends Controller
{
    public const MAX_STOREFRONT_PRODUCTS = StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS;

    public function __construct(
        private readonly StorefrontCatalogService $catalogService,
        private readonly StorefrontCheckoutService $checkoutService,
        private readonly StorefrontInteractionService $interactionService,
        private readonly StorefrontPresenter $presenter,
        private readonly StorefrontEntitlements $entitlements,
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
        $slugs = $this->catalogService->getPublishedSlugs();

        return response()->json([
            'slugs' => $slugs,
            'branches' => (object) app(StorefrontBranchDirectory::class)->forStorefronts($slugs),
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
        $resolved = $this->publishedBranch($request, $store_slug);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }
        [$storefront, $branch, $entitlements] = $resolved;

        $branchData = $this->presenter->branchPayload($branch, $this->catalogService->storeCurrency($branch), $entitlements);

        return response()->json([
            'storefront' => $this->presenter->profile($storefront, $branch, $entitlements),
            'branches' => $this->presenter->branchSummaries($storefront, $this->catalogService->getStorefrontBranches($storefront)),
            'selected_branch' => $branchData,
            'store' => $branchData,
            'products' => StorefrontProductResource::collection($this->catalogService->getLandingProducts($branch)),
            'product_count' => $this->catalogService->storeProducts($branch)->count(),
            'online_payment_available' => $branchData['online_payment_available'],
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
            new OA\Parameter(name: 'ids', in: 'query', required: false, description: 'Comma-separated product ids (at most 100): returns only those that are listed online, so a cart can be re-priced however far down the catalog its items sit', schema: new OA\Schema(type: 'string')),
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
        $resolved = $this->publishedBranch($request, $store_slug);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }
        [$storefront, $branch, $entitlements] = $resolved;

        $paginated = $this->catalogService->paginateProducts(
            $branch,
            $request->input('q'),
            $request->input('category'),
            (int) $request->input('per_page', StorefrontCatalogService::PER_PAGE),
            $this->catalogService->parseRequestedIds($request->input('ids')),
        );

        $branchData = [
            'id' => $branch->id,
            'name' => $branch->name,
            'currency' => $this->catalogService->storeCurrency($branch),
            'online_payment_available' => $this->presenter->onlinePaymentAvailable($branch, $entitlements),
        ];

        return StorefrontProductResource::collection($paginated)->additional([
            'categories' => $this->catalogService->getStoreCategories($branch),
            'store' => $branchData,
            'selected_branch' => $branchData,
            'branches' => $this->presenter->branchSummaries($storefront, $this->catalogService->getStorefrontBranches($storefront), detailed: false),
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
                new OA\Property(property: 'product_id', type: 'string', nullable: true),
                new OA\Property(property: 'service_id', type: 'string', nullable: true, description: 'A bookable service instead of a product; exactly one of product_id or service_id per line.'),
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
        $resolved = $this->publishedBranch($request, $store_slug, explicitBranch: true);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }
        [, $branch, $entitlements] = $resolved;

        if ($refusal = $this->entitlements->checkoutRefusal($entitlements, 'paystack', 'pickup')) {
            return response()->json(['message' => $refusal], 422);
        }

        $validated = $request->validate([
            'customer_email' => 'required|email|max:255',
            'branch_id' => 'nullable|string',
            ...StorefrontCheckoutRules::itemRules(),
        ]);

        return $this->checkoutService->initializePayment($branch, $validated, $paymentService);
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
                new OA\Property(property: 'product_id', type: 'string', nullable: true),
                new OA\Property(property: 'service_id', type: 'string', nullable: true, description: 'A bookable service instead of a product; exactly one of product_id or service_id per line.'),
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
        $resolved = $this->publishedBranch($request, $store_slug, explicitBranch: true);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }
        [$storefront, $branch, $entitlements] = $resolved;

        $validated = $request->validate(StorefrontCheckoutRules::rules());
        $fulfilment = $validated['fulfilment_method'] ?? 'pickup';

        if ($fulfilment === 'delivery' && ! $storefront->delivery_available) {
            return response()->json(['message' => 'This store does not offer delivery.'], 422);
        }

        if ($fulfilment === 'delivery' && $validated['payment_method'] === 'in_store' && ! $storefront->pay_on_delivery) {
            return response()->json(['message' => 'This store does not accept payment on delivery. Pay by transfer or online.'], 422);
        }

        if ($refusal = $this->entitlements->checkoutRefusal($entitlements, $validated['payment_method'], $fulfilment)) {
            return response()->json(['message' => $refusal], 422);
        }

        return $this->checkoutService->placeOrder($branch, $validated, $paymentService);
    }

    public function trackOrder($store_slug, $identifier)
    {
        return $this->interactionService->trackOrder($store_slug, $identifier);
    }

    public function uploadPrescription($store_slug, Request $request)
    {
        return $this->interactionService->uploadPrescription($store_slug, $request);
    }

    /**
     * @return array{0: Storefront, 1: Store, 2: array<string, mixed>}|JsonResponse
     */
    private function publishedBranch(Request $request, string $slug, bool $explicitBranch = false): array|JsonResponse
    {
        $storefront = $this->catalogService->resolveStorefront($slug);
        if (! $storefront) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        $named = $explicitBranch
            ? ($request->input('branch_id') ?? $request->input('branch'))
            : ($request->input('branch') ?? $request->input('branch_id'));
        $branch = $this->catalogService->resolveBranch($storefront, $named, $slug, requireExplicitMatch: $explicitBranch);

        if (! $branch) {
            return $explicitBranch && $named
                ? response()->json(['message' => 'That branch is no longer available. Reload the page and choose a branch again.'], 422)
                : response()->json(['error' => 'Store unavailable'], 404);
        }

        if ($branch->isSuspended()) {
            return response()->json(['error' => 'Store unavailable'], 403);
        }

        $entitlements = $this->entitlements->forStore($branch);
        if (! $branch->online_store_enabled || ! $entitlements['storefront_enabled']) {
            return response()->json(['error' => 'Store unavailable'], 404);
        }

        return [$storefront, $branch, $entitlements];
    }
}
