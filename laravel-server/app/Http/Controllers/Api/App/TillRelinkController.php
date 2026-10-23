<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\TillRelinkService;
use Illuminate\Http\Request;

class TillRelinkController extends Controller
{
    public const REJECTION = ['message' => 'Invalid or expired code.'];

    public function __construct(private TillRelinkService $relinks)
    {
    }

    public function create(Request $request)
    {
        $validated = $request->validate(['store_id' => 'required|uuid']);
        $user = $request->user();

        $store = Store::where('id', $validated['store_id'])->first();
        $isOwner = $store && $store->user_id === $user->id;

        if (!$isOwner || $user->currentAccessToken()?->name === 'Impersonation Token') {
            return response()->json(['message' => 'Only the store owner can generate a re-link code.'], 403);
        }

        return response()->json($this->relinks->generate($user, $store, [
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]));
    }

    public function consume(Request $request)
    {
        $code = $request->input('code');
        $storeId = $request->header('X-Store-Id');

        if (!is_string($code) || strlen($code) > 32 || !is_string($storeId) || $storeId === '') {
            return response()->json(self::REJECTION, 422);
        }

        $result = $this->relinks->consume($code, $storeId, [
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'id' => $request->header('X-Device-Id'),
            'label' => $request->header('X-Device-Label'),
        ]);

        return $result ? response()->json($result) : response()->json(self::REJECTION, 422);
    }
}
