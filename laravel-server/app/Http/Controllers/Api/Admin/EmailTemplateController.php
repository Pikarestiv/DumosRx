<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use Illuminate\Http\Request;

class EmailTemplateController extends Controller
{
    public function index()
    {
        $templates = EmailTemplate::select('id', 'key', 'name', 'subject', 'variables')->get();
        return response()->json([
            'success' => true,
            'templates' => $templates
        ]);
    }

    public function show($id)
    {
        $template = EmailTemplate::findOrFail($id);
        return response()->json([
            'success' => true,
            'template' => $template
        ]);
    }

    public function update(Request $request, $id)
    {
        $template = EmailTemplate::findOrFail($id);

        $request->validate([
            'subject' => 'required|string|max:255',
            'content' => 'required|string',
        ]);

        $template->update([
            'subject' => $request->subject,
            'content' => $request->content
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email template updated successfully',
            'template' => $template
        ]);
    }
}
