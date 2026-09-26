<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use OpenApi\Attributes as OA;

class StoreController extends Controller
{
    #[OA\Get(
        path: '/stores',
        summary: "List the caller's stores",
        tags: ['Stores'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Stores', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        return $request->user()->stores;
    }

    #[OA\Get(
        path: '/stores/{store}',
        summary: 'Get one of the caller\'s stores',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The store', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $store = $request->user()->stores()->findOrFail($id);
        return response()->json($store);
    }

    #[OA\Get(
        path: '/stores/check-slug',
        summary: 'Check whether a storefront slug is available',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'slug', in: 'query', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'ignore_id', in: 'query', description: 'Exclude this store ID from the collision check (e.g. when editing an existing store)', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Availability', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'available', type: 'boolean'),
                new OA\Property(property: 'slug', type: 'string', description: 'The slugified version of the input'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function checkSlug(Request $request)
    {
        $request->validate([
            'slug' => 'required|string|max:255'
        ]);

        $slug = Str::slug($request->slug);
        
        // Exclude the current store if ID is provided
        $query = Store::where('store_slug', $slug);
        if ($request->has('ignore_id')) {
            $query->where('id', '!=', $request->ignore_id);
        }

        $exists = $query->exists();

        return response()->json([
            'available' => !$exists,
            'slug' => $slug
        ]);
    }

    #[OA\Get(
        path: '/stores/{store}/payment-banks',
        summary: "List banks for a country, for the store's online-payment setup",
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'country', in: 'query', required: true, schema: new OA\Schema(type: 'string', enum: ['nigeria', 'ghana', 'kenya', 'south africa', 'rwanda', 'cote d\'ivoire'])),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Bank list (empty for a country this Paystack endpoint doesn\'t cover - the client falls back to a free-text bank name field)', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'banks', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function paymentBanks(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate(['country' => 'required|string']);

        return response()->json(['banks' => $paystack->listBanks($validated['country'])]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account/resolve',
        summary: 'Resolve a bank account number to a name, where Paystack supports it for the given country',
        description: 'Returns account_name: null (not an error) when the country/bank combination can\'t be verified automatically - the client must show that as "we can\'t verify this, please double check" rather than skip the notice.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['account_number', 'bank_code', 'country'],
            properties: [
                new OA\Property(property: 'account_number', type: 'string'),
                new OA\Property(property: 'bank_code', type: 'string'),
                new OA\Property(property: 'country', type: 'string'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Resolution result', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'account_name', type: 'string', nullable: true),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function resolvePaymentAccount(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate([
            'account_number' => 'required|string',
            'bank_code' => 'required|string',
            'country' => 'required|string',
        ]);

        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);

        return response()->json(['account_name' => $resolved['account_name'] ?? null]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account',
        summary: 'Create the store\'s Paystack subaccount for online payment',
        description: 'Idempotent once a subaccount already exists (409, no Paystack call made) - a store changing banks is a "contact support" path, not this endpoint. Re-resolves the account server-side before creating it (never trusts a client-sent "I checked" flag alone); a country resolveAccount() genuinely can\'t verify requires confirmed_unverifiable: true instead. The full account number is never persisted; only the last 4 digits are stored for display.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['account_number', 'bank_code', 'country'],
            properties: [
                new OA\Property(property: 'account_number', type: 'string'),
                new OA\Property(property: 'bank_code', type: 'string'),
                new OA\Property(property: 'country', type: 'string'),
                new OA\Property(property: 'confirmed_unverifiable', type: 'boolean', description: 'Required (true) when this country/bank can\'t be auto-verified and the owner has double-checked the details themselves.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Connected', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 409, description: 'This store already has a payment account connected'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Paystack rejected the account details'),
        ],
    )]
    public function createPaymentAccount(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $store = $request->user()->stores()->findOrFail($id);

        if ($store->paystack_subaccount_code) {
            return response()->json(['message' => 'This store already has a payment account connected.'], 409);
        }

        $validated = $request->validate([
            'account_number' => 'required|string',
            'bank_code' => 'required|string',
            'country' => 'required|string',
            'confirmed_unverifiable' => 'sometimes|boolean',
        ]);

        // Re-resolve server-side rather than trusting a client-sent "I
        // checked" flag alone: a bypassed/buggy client must not be able to
        // create a subaccount against a typo'd account with no check at
        // all. A country/bank this endpoint can verify MUST resolve to a
        // name before proceeding; a country it can't (resolveAccount()
        // returning null because Paystack itself has no resolver for it,
        // not because the account is wrong) requires the explicit
        // confirmation flag instead.
        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);
        if (!$resolved && !($validated['confirmed_unverifiable'] ?? false)) {
            return response()->json([
                'message' => 'Could not verify this account. Please double-check the details, or confirm you\'ve checked them yourself if this country can\'t be verified automatically.',
            ], 422);
        }

        $feePercentage = (float) \App\Models\SystemConfig::getVal('storefront_platform_fee_percentage', 2.0);

        try {
            $code = $paystack->createSubaccount(
                $store->name,
                $validated['bank_code'],
                $validated['account_number'],
                $feePercentage,
            );
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Paystack subaccount creation failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Could not connect this bank account. Please double-check the details and try again.',
            ], 422);
        }

        $store->update([
            'paystack_subaccount_code' => $code,
            'paystack_subaccount_country' => $validated['country'],
            'paystack_bank_code' => $validated['bank_code'],
            'paystack_account_number_last4' => substr($validated['account_number'], -4),
        ]);

        return response()->json(['message' => 'Payment account connected.']);
    }

    #[OA\Post(
        path: '/stores',
        summary: 'Create a new store for the caller',
        description: 'Blocked (422) if the plan\'s store/device limit is already reached. Auto-creates a trial subscription for the user if they have none yet.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'location', type: 'string', nullable: true),
                new OA\Property(property: 'address', type: 'string', nullable: true),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'store_type', type: 'string', nullable: true, enum: ['pharmacy', 'supermarket', 'grocery', 'general', 'retail']),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'store', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Validation failure, or store limit reached for the plan'),
        ],
    )]
    public function store(Request $request)
    {
        if (!app(\App\Services\SubscriptionService::class)->checkLimit($request->user(), 'stores')) {
            return response()->json([
                'message' => 'Store/Device limit reached for your current plan. Please upgrade your plan to add more locations or devices.'
            ], 422);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
            'store_type' => 'nullable|string|in:pharmacy,supermarket,grocery,general,retail',
        ]);

        $user = $request->user();

        $store = Store::create([
            'user_id' => $user->id,
            'name' => $request->name,
            'location' => $request->location,
            'address' => $request->address,
            'phone' => $request->phone,
            'device_id' => 'WEB-' . strtoupper(Str::random(8)),
            'store_type' => $request->store_type ?? 'pharmacy',
            'auto_sync_enabled' => true,
        ]);

        // Auto-create a trial subscription if the user doesn't have one
        if (!$user->subscriptions()->exists()) {
            app(\App\Services\SubscriptionService::class)->createTrial($user);
        }

        return response()->json([
            'message' => 'Store registered successfully',
            'store' => $store
        ], 201);
    }

    #[OA\Patch(
        path: '/stores/{store}',
        summary: 'Update a store (PATCH alias of PUT)',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'location', type: 'string', nullable: true),
                new OA\Property(property: 'address', type: 'string', nullable: true),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'store_type', type: 'string', nullable: true, enum: ['pharmacy', 'supermarket', 'grocery', 'general', 'retail']),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/stores/{store}',
        summary: 'Update a store',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'location', type: 'string', nullable: true),
                new OA\Property(property: 'address', type: 'string', nullable: true),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'store_type', type: 'string', nullable: true, enum: ['pharmacy', 'supermarket', 'grocery', 'general', 'retail']),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'store', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, $id)
    {
        $store = $request->user()->stores()->findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'phone' => 'nullable|string',
            'store_type' => 'nullable|string|in:pharmacy,supermarket,grocery,general,retail',
        ]);

        $store->update($request->only(['name', 'location', 'address', 'phone', 'store_type']));

        return response()->json([
            'message' => 'Store updated successfully',
            'store' => $store
        ]);
    }

    #[OA\Delete(
        path: '/stores/{store}',
        summary: 'Delete a store',
        description: 'Also deactivates (not deletes) all staff belonging to the store.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Request $request, $id)
    {
        $store = $request->user()->stores()->findOrFail($id);
        
        // Deactivate associated staff
        User::where('store_id', $store->id)->update(['is_active' => false]);
        
        $store->delete();

        return response()->json([
            'message' => 'Store removed successfully'
        ]);
    }
}
