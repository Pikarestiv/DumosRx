<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class ProductController extends Controller
{
    #[OA\Get(
        path: '/app/products',
        summary: 'List active products in the store catalog',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated products, with category/supplier eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $products = Product::with('category', 'supplier')
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

        $products = Product::with('category', 'supplier')
            ->where('is_active', true)
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('brand_name', 'like', "%{$query}%")
                  ->orWhere('generic_name', 'like', "%{$query}%")
                  ->orWhere('barcode', 'like', "%{$query}%");
            })
            ->paginate($limit);

        return response()->json($products);
    }

    #[OA\Get(
        path: '/app/products/{product}',
        summary: 'Get a product with category, supplier, and stock batches',
        tags: ['Products'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'product', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The product', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show($id)
    {
        $medicine = Product::with('category', 'supplier', 'stock_batches')->findOrFail($id);
        return response()->json($medicine);
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
                new OA\Property(property: 'selling_price', type: 'number', format: 'float'),
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
        $request->validate([
            'name' => 'required|string|max:255',
            'selling_price' => 'required|numeric',
        ]);

        $medicine = Product::create($request->all());

        return response()->json($medicine, 201);
    }
}
