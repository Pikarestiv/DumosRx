<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class AccountManagerController extends Controller
{
    use ScopesToTenant;

    #[OA\Get(
        path: '/account-manager',
        summary: "Get the caller's contact specialist / account manager",
        description: 'Resolution order: the tenant owner\'s account_manager_id (explicit reassignment) -> registered_by_id (who referred/created the account) -> the default_account_manager_id system config. Returns null data if none of those resolve to an existing user.',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Resolved contact (or null)', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'data', type: 'object', nullable: true),
            ])),
        ],
    )]
    public function show(Request $request)
    {
        $ownerId = $this->tenantOwnerId($request);
        $owner = User::find($ownerId);

        $manager = static::resolveFor($owner);

        if (!$manager) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => [
                'id' => $manager->id,
                'name' => trim("{$manager->first_name} {$manager->last_name}"),
                'email' => $manager->email,
                'phone' => $manager->phone,
            ],
        ]);
    }

    public static function resolveFor(?User $owner): ?User
    {
        if (!$owner) {
            return null;
        }

        if ($owner->account_manager_id) {
            $explicit = $owner->accountManager;
            if ($explicit) {
                return $explicit;
            }
        }

        if ($owner->registered_by_id) {
            $referrer = $owner->registeredBy;
            if ($referrer) {
                return $referrer;
            }
        }

        $defaultId = SystemConfig::getVal('default_account_manager_id');

        return $defaultId ? User::find($defaultId) : null;
    }
}
