<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown from inside StorefrontController::checkout()'s order-creating DB
 * transaction when the storefront payment intent it locked turns out to have
 * already been consumed by a concurrent confirmation of the same reference.
 *
 * Its own type (rather than a bare RuntimeException) so the catch around the
 * transaction can turn exactly this case into the same 422 the pre-checks
 * return, without swallowing unrelated runtime errors.
 */
class PaymentReferenceAlreadyUsedException extends RuntimeException
{
}
