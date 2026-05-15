<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BackupController extends Controller
{
    public function upload(Request $request)
    {
        $request->validate([
            'backup' => 'required|file',
        ]);

        $path = $request->file('backup')->store('backups');

        return response()->json(['success' => true, 'path' => $path]);
    }

    public function list()
    {
        $files = Storage::files('backups');
        return response()->json($files);
    }

    public function download($backup)
    {
        return Storage::download("backups/{$backup}");
    }
}
