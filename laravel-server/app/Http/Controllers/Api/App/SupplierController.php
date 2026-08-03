<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class SupplierController extends Controller
{
    use ScopesToTenant;

    #[OA\Get(
        path: '/app/suppliers',
        summary: "List the store's suppliers",
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Suppliers', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        return Supplier::where('user_id', $this->tenantOwnerId($request))->get();
    }

    #[OA\Get(
        path: '/app/suppliers/{supplier}',
        summary: 'Get a supplier',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'supplier', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The supplier', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $supplier = Supplier::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);
        return response()->json($supplier);
    }

    #[OA\Post(
        path: '/app/suppliers',
        summary: 'Create a supplier',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'contact_person', type: 'string', nullable: true),
                new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'address', type: 'string', nullable: true),
                new OA\Property(property: 'city', type: 'string', nullable: true),
                new OA\Property(property: 'state', type: 'string', nullable: true),
                new OA\Property(property: 'country', type: 'string', nullable: true),
                new OA\Property(property: 'tax_id', type: 'string', nullable: true),
                new OA\Property(property: 'payment_terms', type: 'integer', nullable: true, description: 'Net payment days'),
                new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
                new OA\Property(property: 'rating', type: 'number', nullable: true),
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
            'contact_person' => 'nullable|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'address' => 'nullable|string',
            'city' => 'nullable|string',
            'state' => 'nullable|string',
            'country' => 'nullable|string',
            'tax_id' => 'nullable|string',
            'payment_terms' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'rating' => 'nullable|numeric',
        ]);

        $validated['user_id'] = $this->tenantOwnerId($request);
        $supplier = Supplier::create($validated);

        return response()->json($supplier, 201);
    }

    #[OA\Patch(
        path: '/app/suppliers/{supplier}',
        summary: 'Update a supplier (PATCH alias of PUT)',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'supplier', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'contact_person', type: 'string', nullable: true),
            new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
            new OA\Property(property: 'phone', type: 'string', nullable: true),
            new OA\Property(property: 'address', type: 'string', nullable: true),
            new OA\Property(property: 'city', type: 'string', nullable: true),
            new OA\Property(property: 'state', type: 'string', nullable: true),
            new OA\Property(property: 'country', type: 'string', nullable: true),
            new OA\Property(property: 'tax_id', type: 'string', nullable: true),
            new OA\Property(property: 'payment_terms', type: 'integer', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
            new OA\Property(property: 'rating', type: 'number', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/app/suppliers/{supplier}',
        summary: 'Update a supplier',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'supplier', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'name', type: 'string', maxLength: 255),
            new OA\Property(property: 'contact_person', type: 'string', nullable: true),
            new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
            new OA\Property(property: 'phone', type: 'string', nullable: true),
            new OA\Property(property: 'address', type: 'string', nullable: true),
            new OA\Property(property: 'city', type: 'string', nullable: true),
            new OA\Property(property: 'state', type: 'string', nullable: true),
            new OA\Property(property: 'country', type: 'string', nullable: true),
            new OA\Property(property: 'tax_id', type: 'string', nullable: true),
            new OA\Property(property: 'payment_terms', type: 'integer', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean', nullable: true),
            new OA\Property(property: 'rating', type: 'number', nullable: true),
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
        $supplier = Supplier::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'contact_person' => 'nullable|string',
            'email' => 'nullable|email',
            'phone' => 'nullable|string',
            'address' => 'nullable|string',
            'city' => 'nullable|string',
            'state' => 'nullable|string',
            'country' => 'nullable|string',
            'tax_id' => 'nullable|string',
            'payment_terms' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
            'rating' => 'nullable|numeric',
        ]);

        $supplier->update($validated);

        return response()->json($supplier);
    }

    #[OA\Delete(
        path: '/app/suppliers/{supplier}',
        summary: 'Delete a supplier',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'supplier', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Request $request, $id)
    {
        $supplier = Supplier::where('user_id', $this->tenantOwnerId($request))->findOrFail($id);
        $supplier->delete();

        return response()->json(['message' => 'Supplier deleted']);
    }
}
