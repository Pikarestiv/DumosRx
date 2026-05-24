<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use Illuminate\Http\Request;

class SystemConfigController extends Controller
{
    /**
     * Get a specific configuration (Public/Authenticated)
     */
    public function show($key)
    {
        $config = SystemConfig::where('key', $key)->first();

        if (!$config) {
            return response()->json([
                'success' => false,
                'message' => 'Configuration not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $config->value
        ]);
    }

    /**
     * Update a specific configuration (Admin Only)
     */
    public function update(Request $request, $key)
    {
        $validated = $request->validate([
            'value' => 'required'
        ]);

        $config = SystemConfig::setVal($key, $validated['value']);

        return response()->json([
            'success' => true,
            'message' => 'Configuration updated successfully',
            'data' => $config->value
        ]);
    }
}
