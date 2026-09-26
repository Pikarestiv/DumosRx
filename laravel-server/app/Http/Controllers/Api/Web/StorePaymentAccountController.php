<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use App\Services\Payment\PaystackSubaccountService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

/**
 * The store owner's online-payment onboarding: bank list, account
 * resolution, and the one endpoint allowed to write a store's
 * paystack_* settlement columns. See laravel-server/AGENTS.md.
 */
class StorePaymentAccountController extends Controller
{
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
    public function paymentBanks(Request $request, $id, PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate(['country' => 'required|string']);

        return response()->json(['banks' => $paystack->listBanks($validated['country'])]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account/resolve',
        summary: 'Resolve a bank account number to a name, where Paystack supports it for the given country',
        description: 'Returns `verifiable: false` with `account_name: null` for a country Paystack has no resolver for - the only case the client may offer the "I have double-checked these details" override. For a verifiable country (`verifiable: true`) a null account_name means the details are wrong, and the override is refused by POST /stores/{store}/payment-account.',
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
                new OA\Property(property: 'verifiable', type: 'boolean'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function resolvePaymentAccount(Request $request, $id, PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate([
            'account_number' => 'required|string',
            'bank_code' => 'required|string',
            'country' => 'required|string',
        ]);

        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);

        return response()->json([
            'account_name' => $resolved['account_name'] ?? null,
            'verifiable' => PaystackSubaccountService::supportsAccountResolution($validated['country']),
        ]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account',
        summary: 'Create the store\'s Paystack subaccount for online payment',
        description: 'Idempotent once a subaccount already exists (409, no Paystack call made) - a store changing banks is a "contact support" path, not this endpoint. Re-resolves the account server-side before creating it (never trusts a client-sent "I checked" flag alone). confirmed_unverifiable is accepted ONLY for a country Paystack has no resolver for; for a resolvable country it is refused, since a failed resolution there means the account details are wrong. The full account number is never persisted; only the last 4 digits are stored for display.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['account_number', 'bank_code', 'country'],
            properties: [
                new OA\Property(property: 'account_number', type: 'string'),
                new OA\Property(property: 'bank_code', type: 'string'),
                new OA\Property(property: 'country', type: 'string'),
                new OA\Property(property: 'confirmed_unverifiable', type: 'boolean', description: 'Required (true) when this country can\'t be auto-verified and the owner has double-checked the details themselves. Rejected for a country that can be auto-verified.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Connected', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 409, description: 'This store already has a payment account connected'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Paystack rejected the account details, or confirmed_unverifiable was sent for a verifiable country'),
        ],
    )]
    public function createPaymentAccount(Request $request, $id, PaystackSubaccountService $paystack)
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

        $confirmedUnverifiable = (bool) ($validated['confirmed_unverifiable'] ?? false);
        $verifiable = PaystackSubaccountService::supportsAccountResolution($validated['country']);

        if ($confirmedUnverifiable && $verifiable) {
            return response()->json([
                'message' => 'Accounts in this country can be verified automatically - please correct the account details rather than confirming them manually.',
            ], 422);
        }

        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);
        if (!$resolved && !$confirmedUnverifiable) {
            return response()->json([
                'message' => $verifiable
                    ? 'Could not verify this account. Please double-check the account number and bank.'
                    : 'Could not verify this account. Accounts in this country can\'t be verified automatically - confirm you\'ve double-checked the details yourself.',
            ], 422);
        }

        $feePercentage = (float) SystemConfig::getVal('storefront_platform_fee_percentage', 2.0);

        try {
            $code = $paystack->createSubaccount(
                $store->name,
                $validated['bank_code'],
                $validated['account_number'],
                $feePercentage,
            );
        } catch (\Exception $e) {
            Log::error('Paystack subaccount creation failed: ' . $e->getMessage());
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
}
