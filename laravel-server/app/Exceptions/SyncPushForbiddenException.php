<?php

namespace App\Exceptions;

// A refusal only this session's narrower ownership envelope makes - the
// owner's own session would accept it. See docs/FIXED_BUGS.md A-167.
class SyncPushForbiddenException extends SyncPushRefusalException
{
    public const REASON = 'forbidden';
}
