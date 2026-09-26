<?php

namespace App\Http\Controllers\Api\Internal;

use App\Console\Commands\RebuildStorefrontIfDirty;
use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

/**
 * The inbound half of the storefront rebuild loop. RebuildStorefrontIfDirty
 * asks GitHub for a rebuild; this is how the workflow reports that the rebuild
 * actually shipped, so storefront_dirty_at is cleared on success instead of on
 * GitHub accepting the dispatch (a failed build used to lose the pending
 * rebuild permanently - docs/STOREFRONT_REVIEW.md, SF-P2-3).
 *
 * Authenticated by a shared secret header rather than Sanctum: the caller is a
 * GitHub Actions runner with no user. Deliberately NOT a cookie or any ambient
 * credential - see laravel-server/AGENTS.md on why this app never promotes
 * ambient credentials into blanket auth.
 */
class StorefrontRebuildController extends Controller
{
    #[OA\Post(
        path: '/internal/storefront/rebuild-complete',
        summary: 'Confirm that a dispatched storefront rebuild has been deployed',
        description: 'Called by .github/workflows/deploy-web.yml after a successful FTP sync. Clears storefront_dirty_at for every store that was already dirty when the rebuild was dispatched; stores dirtied *during* the build stay dirty so the next scheduled run picks them up. Authenticated by the X-Storefront-Rebuild-Token header (STOREFRONT_REBUILD_TOKEN).',
        tags: ['Storefront'],
        responses: [
            new OA\Response(response: 200, description: 'Flags cleared', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'cleared', type: 'integer'),
            ])),
            new OA\Response(response: 401, description: 'Missing or incorrect rebuild token'),
            new OA\Response(response: 503, description: 'Rebuild confirmation is not configured on this server'),
        ],
    )]
    public function complete(Request $request)
    {
        $expected = (string) config('dumos.storefront.rebuild_token');

        if ($expected === '') {
            return response()->json([
                'message' => 'Storefront rebuild confirmation is not configured.',
            ], 503);
        }

        $provided = (string) $request->header('X-Storefront-Rebuild-Token', '');

        if (! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $requestedAt = SystemConfig::getVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY);
        $cutoff = $requestedAt ? Carbon::parse($requestedAt) : now();

        $cleared = DB::table('stores')
            ->whereNotNull('storefront_dirty_at')
            ->where('storefront_dirty_at', '<=', $cutoff)
            ->update(['storefront_dirty_at' => null]);

        SystemConfig::setVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY, null);

        return response()->json(['cleared' => $cleared]);
    }
}
