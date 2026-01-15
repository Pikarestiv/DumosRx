<?php

namespace App\Http\Controllers;

use App\Models\Backup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BackupController extends Controller
{
    public function upload(Request $request)
    {
        $request->validate([
            'file' => 'required|file', // Encrypted blob
        ]);

        $file = $request->file('file');
        $path = $file->store('backups');
        
        $backup = Backup::create([
            'filename' => $path,
            'size' => $file->getSize(),
            'hash' => hash_file('sha256', $file->getRealPath()),
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Backup uploaded', 'id' => $backup->id]);
    }

    public function list()
    {
        return Backup::orderBy('created_at', 'desc')->take(10)->get();
    }

    public function download(Backup $backup)
    {
        return Storage::download($backup->filename);
    }
}
