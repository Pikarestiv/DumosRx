<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class CategoryController extends Controller
{
    use ScopesToTenant;

    #[OA\Get(
        path: '/app/categories',
        summary: "List the store's product categories",
        tags: ['Categories'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Categories', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        return Category::where('user_id', $this->tenantOwnerId($request))->get();
    }

    #[OA\Get(
        path: '/app/categories/{category}',
        summary: 'Get a category',
        tags: ['Categories'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'category', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The category', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $category = Category::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);
        return response()->json($category);
    }

    #[OA\Post(
        path: '/app/categories',
        summary: 'Create a product category',
        tags: ['Categories'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'description', type: 'string', nullable: true),
                new OA\Property(property: 'parent_id', type: 'string', nullable: true),
                new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'parent_id' => 'nullable|exists:categories,id',
            'is_active' => 'nullable|boolean',
        ]);

        $validated['user_id'] = $this->tenantOwnerId($request);
        $category = Category::create($validated);

        return response()->json($category, 201);
    }

    #[OA\Patch(
        path: '/app/categories/{category}',
        summary: 'Update a category (PATCH alias of PUT)',
        tags: ['Categories'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'category', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'description', type: 'string', nullable: true),
            new OA\Property(property: 'parent_id', type: 'string', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/app/categories/{category}',
        summary: 'Update a category',
        tags: ['Categories'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'category', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'description', type: 'string', nullable: true),
            new OA\Property(property: 'parent_id', type: 'string', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, $id)
    {
        $category = Category::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'parent_id' => 'nullable|exists:categories,id',
            'is_active' => 'nullable|boolean',
        ]);

        $category->update($validated);

        return response()->json($category);
    }

    #[OA\Delete(
        path: '/app/categories/{category}',
        summary: 'Delete a category',
        tags: ['Categories'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'category', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Request $request, $id)
    {
        $category = Category::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);
        $category->delete();

        return response()->json(['message' => 'Category deleted']);
    }
}
