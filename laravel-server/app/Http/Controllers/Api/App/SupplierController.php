<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class SupplierController extends Controller
{
    #[OA\Get(
        path: '/app/suppliers',
        summary: 'List suppliers',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Suppliers', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index()
    {
        return Supplier::all();
    }

    #[OA\Post(
        path: '/app/suppliers',
        summary: 'Create a supplier',
        tags: ['Suppliers'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name'],
            properties: [new OA\Property(property: 'name', type: 'string', maxLength: 255)],
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
        ]);

        $supplier = Supplier::create($request->all());

        return response()->json($supplier, 201);
    }
}
