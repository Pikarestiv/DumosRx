<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class CustomerController extends Controller
{
    #[OA\Get(
        path: '/app/customers',
        summary: "List the store's customers",
        tags: ['Customers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'limit', in: 'query', schema: new OA\Schema(type: 'integer', default: 50))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated customers', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $limit = $request->get('limit', 50);
        $customers = Customer::where('user_id', $request->user()->id)
            ->latest()
            ->paginate($limit);
        return response()->json($customers);
    }

    #[OA\Get(
        path: '/app/customers/{customer}',
        summary: 'Get a customer, including their sales history',
        tags: ['Customers'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'customer', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The customer', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $customer = Customer::where('user_id', $request->user()->id)
            ->with('sales')
            ->findOrFail($id);
        return response()->json($customer);
    }

    #[OA\Post(
        path: '/app/customers',
        summary: 'Create a customer',
        tags: ['Customers'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['first_name', 'last_name'],
            properties: [
                new OA\Property(property: 'first_name', type: 'string', maxLength: 255),
                new OA\Property(property: 'last_name', type: 'string', maxLength: 255),
                new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'address', type: 'string', nullable: true),
                new OA\Property(property: 'date_of_birth', type: 'string', format: 'date', nullable: true),
                new OA\Property(property: 'gender', type: 'string', nullable: true),
                new OA\Property(property: 'allergies', type: 'array', items: new OA\Items(type: 'string'), nullable: true),
                new OA\Property(property: 'medical_conditions', type: 'string', nullable: true),
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
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:500',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'allergies' => 'nullable|array',
            'medical_conditions' => 'nullable|string|max:1000',
        ]);

        $customer = new Customer($validated);
        $customer->user_id = $request->user()->id;
        $customer->save();

        return response()->json($customer, 201);
    }
}
