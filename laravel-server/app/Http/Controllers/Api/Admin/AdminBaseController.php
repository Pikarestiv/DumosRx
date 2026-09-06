<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Log;

/**
 * Shared by AdminPlatformController/AdminStoreController/AdminUserController
 * (the split of the original AdminController by sub-domain).
 */
abstract class AdminBaseController extends Controller
{
    /**
     * Runs $callback and turns any \Exception into the standard
     * Log::error(...) + JSON 500 shape most admin actions share.
     */
    protected function withErrorResponse(string $logLabel, string $failureMessage, callable $callback)
    {
        try {
            return $callback();
        } catch (\Exception $e) {
            Log::error("Admin {$logLabel} Error: " . $e->getMessage());
            return response()->json(['error' => $failureMessage], 500);
        }
    }
}
