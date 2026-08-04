<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class ProductController extends Controller
{
    use ScopesToTenant;

    #[OA\Get(
        path: '/app/products',
        summary: 'List active products in the store catalog',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated products, with category eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $products = Product::with('category')
            ->where('user_id', $this->tenantOwnerId($request))
            ->where('is_active', true)
            ->latest()
            ->paginate($limit);

        return response()->json($products);
    }

    #[OA\Get(
        path: '/app/products/search',
        summary: 'Search products by name, brand, generic name, or barcode',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'q', in: 'query', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50)),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Matching products', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function search(Request $request)
    {
        $query = $request->get('q');
        $limit = $request->get('limit', 50);

        $products = Product::with('category')
            ->where('user_id', $this->tenantOwnerId($request))
            ->where('is_active', true)
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('generic_name', 'like', "%{$query}%")
                  ->orWhere('barcode', 'like', "%{$query}%");
            })
            ->paginate($limit);

        return response()->json($products);
    }

    #[OA\Get(
        path: '/app/products/{product}',
        summary: 'Get a product with category and stock batches (each with its supplier)',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'product', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The product', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $product = Product::with('category', 'stockBatches.supplier')
            ->where('user_id', $this->tenantOwnerId($request))
            ->findOrFail($id);

        return response()->json($product);
    }

    #[OA\Post(
        path: '/app/products',
        summary: 'Create a product',
        tags: ['Products'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name', 'selling_price'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'generic_name', type: 'string', nullable: true),
                new OA\Property(property: 'category_id', type: 'string', nullable: true),
                new OA\Property(property: 'manufacturer', type: 'string', nullable: true),
                new OA\Property(property: 'selling_price', type: 'number', format: 'float'),
                new OA\Property(property: 'barcode', type: 'string', nullable: true),
                new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
                new OA\Property(property: 'show_online', type: 'boolean', nullable: true),
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
            'selling_price' => 'required|numeric',
            'generic_name' => 'nullable|string',
            'category_id' => 'nullable|exists:categories,id',
            'manufacturer' => 'nullable|string',
            'barcode' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'show_online' => 'nullable|boolean',
        ]);

        $validated['user_id'] = $this->tenantOwnerId($request);
        $medicine = Product::create($validated);

        return response()->json($medicine, 201);
    }

    #[OA\Patch(
        path: '/app/products/{product}',
        summary: 'Update a product (PATCH alias of PUT)',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'product', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'generic_name', type: 'string', nullable: true),
            new OA\Property(property: 'category_id', type: 'string', nullable: true),
            new OA\Property(property: 'manufacturer', type: 'string', nullable: true),
            new OA\Property(property: 'selling_price', type: 'number', format: 'float'),
            new OA\Property(property: 'barcode', type: 'string', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
            new OA\Property(property: 'show_online', type: 'boolean', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/app/products/{product}',
        summary: 'Update a product',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'product', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'generic_name', type: 'string', nullable: true),
            new OA\Property(property: 'category_id', type: 'string', nullable: true),
            new OA\Property(property: 'manufacturer', type: 'string', nullable: true),
            new OA\Property(property: 'selling_price', type: 'number', format: 'float'),
            new OA\Property(property: 'barcode', type: 'string', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
            new OA\Property(property: 'show_online', type: 'boolean', nullable: true),
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
        $product = Product::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'selling_price' => 'sometimes|numeric',
            'generic_name' => 'nullable|string',
            'category_id' => 'nullable|exists:categories,id',
            'manufacturer' => 'nullable|string',
            'barcode' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'show_online' => 'nullable|boolean',
        ]);

        $product->update($validated);

        return response()->json($product);
    }

    #[OA\Delete(
        path: '/app/products/{product}',
        summary: 'Delete a product',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'product', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Request $request, $id)
    {
        $product = Product::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);
        $product->delete();

        return response()->json(['message' => 'Product deleted']);
    }
}
