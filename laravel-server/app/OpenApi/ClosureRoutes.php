<?php

namespace App\OpenApi;

use OpenApi\Attributes as OA;

/**
 * Documents routes defined as inline closures directly in routes/api.php
 * (Route::get('/x', function () {...})) rather than as controller methods.
 * swagger-php's structural scanner only picks up annotations attached to
 * real classes/functions it can reflect on; an anonymous closure passed as
 * a Route::get() argument isn't a "structure" it can attach to, so docblocks
 * placed directly above those closures are silently ignored. This file
 * exists purely so those routes still show up in the generated docs. No
 * runtime behavior.
 */
class ClosureRoutes
{
    #[OA\Get(
        path: '/health',
        summary: 'Basic liveness check',
        tags: ['System Config'],
        responses: [
            new OA\Response(response: 200, description: 'OK', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'status', type: 'string', example: 'ok'),
                new OA\Property(property: 'timestamp', type: 'string', format: 'date-time'),
            ])),
        ],
    )]
    public function health()
    {
    }
}
