<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DownloadLog;
use Illuminate\Http\Request;

class TrackController extends Controller
{
    /**
     * Track a download event
     */
    public function download(Request $request)
    {
        $request->validate([
            'platform' => 'nullable|string|max:50',
        ]);

        DownloadLog::create([
            'platform' => $request->platform ?? 'unknown',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['success' => true]);
    }
}
