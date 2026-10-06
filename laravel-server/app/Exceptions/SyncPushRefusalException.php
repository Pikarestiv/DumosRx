<?php

namespace App\Exceptions;

use RuntimeException;

// Base for every sync-push refusal with a stable, machine-checkable reason.
// See docs/FIXED_BUGS.md A-161 and A-167.
abstract class SyncPushRefusalException extends RuntimeException
{
    public const REASON = '';

    public function reason(): string
    {
        return static::REASON;
    }
}
