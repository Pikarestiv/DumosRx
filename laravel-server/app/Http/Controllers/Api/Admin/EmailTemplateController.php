<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class EmailTemplateController extends Controller
{
    #[OA\Get(
        path: '/admin/email-templates',
        summary: 'List transactional email templates',
        tags: ['Admin: Email Templates'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Templates (summary fields only, no content body)', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'templates', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index()
    {
        $templates = EmailTemplate::select('id', 'key', 'name', 'subject', 'variables')->get();
        return response()->json([
            'success' => true,
            'templates' => $templates
        ]);
    }

    #[OA\Get(
        path: '/admin/email-templates/{email_template}',
        summary: 'Get a single email template, including its full HTML content',
        tags: ['Admin: Email Templates'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'email_template', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The template', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'template', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show($id)
    {
        $template = EmailTemplate::findOrFail($id);
        return response()->json([
            'success' => true,
            'template' => $template
        ]);
    }

    #[OA\Patch(
        path: '/admin/email-templates/{email_template}',
        summary: "Update a template's subject/content (PATCH alias of PUT)",
        tags: ['Admin: Email Templates'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'email_template', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['subject', 'content'],
            properties: [
                new OA\Property(property: 'subject', type: 'string', maxLength: 255),
                new OA\Property(property: 'content', type: 'string'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/admin/email-templates/{email_template}',
        summary: "Update a template's subject/content",
        tags: ['Admin: Email Templates'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'email_template', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['subject', 'content'],
            properties: [
                new OA\Property(property: 'subject', type: 'string', maxLength: 255),
                new OA\Property(property: 'content', type: 'string', description: 'Blade-templated HTML body'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'template', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, $id)
    {
        $template = EmailTemplate::findOrFail($id);

        $request->validate([
            'subject' => 'required|string|max:255',
            'content' => 'required|string',
        ]);

        $template->update([
            'subject' => $request->input('subject'),
            'content' => $request->input('content')
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email template updated successfully',
            'template' => $template
        ]);
    }
}
