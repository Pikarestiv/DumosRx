<?php

namespace App\OpenApi;

use OpenApi\Attributes as OA;

/**
 * Reusable response/schema components referenced across controllers via
 * `ref: '#/components/responses/...'` or `'#/components/schemas/...'`.
 * No runtime behavior — annotation-only, picked up by swagger-php's scan.
 */
#[OA\Response(
    response: 'Unauthorized',
    description: 'Missing or invalid bearer token.',
    content: new OA\JsonContent(
        properties: [new OA\Property(property: 'message', type: 'string', example: 'Unauthenticated.')],
        type: 'object',
    ),
)]
#[OA\Response(
    response: 'Forbidden',
    description: 'Authenticated, but lacks permission for this action.',
    content: new OA\JsonContent(
        properties: [new OA\Property(property: 'message', type: 'string', example: 'This action is unauthorized.')],
        type: 'object',
    ),
)]
#[OA\Response(
    response: 'NotFound',
    description: 'The requested resource does not exist.',
    content: new OA\JsonContent(
        properties: [new OA\Property(property: 'message', type: 'string', example: 'Not found.')],
        type: 'object',
    ),
)]
#[OA\Response(
    response: 'ValidationError',
    description: 'Request failed validation.',
    content: new OA\JsonContent(
        properties: [
            new OA\Property(property: 'message', type: 'string', example: 'The given data was invalid.'),
            new OA\Property(
                property: 'errors',
                type: 'object',
                additionalProperties: new OA\AdditionalProperties(type: 'array', items: new OA\Items(type: 'string')),
            ),
        ],
        type: 'object',
    ),
)]
#[OA\Response(
    response: 'ServerError',
    description: 'Unexpected server-side failure.',
    content: new OA\JsonContent(
        properties: [new OA\Property(property: 'message', type: 'string', example: 'Something went wrong. Please try again.')],
        type: 'object',
    ),
)]
#[OA\Schema(
    schema: 'MessageOnly',
    description: 'Generic acknowledgement response used by many write endpoints.',
    properties: [new OA\Property(property: 'message', type: 'string')],
    type: 'object',
)]
class Schemas
{
}
