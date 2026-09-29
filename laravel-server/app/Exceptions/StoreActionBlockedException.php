<?php

namespace App\Exceptions;

/**
 * Raised when a destructive or restorative store action is refused on
 * policy grounds - a platform-staff owner, the acting admin's own store, a
 * restore whose owner no longer exists - rather than proceeding and
 * failing halfway through on a foreign key or leaving an ownerless store.
 */
class StoreActionBlockedException extends \RuntimeException
{
}
