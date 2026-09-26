<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Thrown from inside StorefrontController::checkout()'s order-creating DB
 * transaction when the availability re-check (stock minus everything already
 * committed to pending orders) fails under the per-store lock, i.e. a
 * concurrent cart took the units between pricing and creation.
 *
 * Carries the already-built 422 so the rollback path returns exactly the same
 * body the pre-check would have, rather than reconstructing it.
 */
class StorefrontStockUnavailableException extends RuntimeException
{
    public function __construct(private JsonResponse $response)
    {
        parent::__construct('Storefront stock unavailable.');
    }

    public function getResponse(): JsonResponse
    {
        return $this->response;
    }
}
