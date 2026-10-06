<?php

namespace App\Exceptions;

// Absolute for the whole tenant - no session could ever accept the payload.
// See client/AGENTS.md's "Catalog versioning..." and docs/FIXED_BUGS.md A-167.
class SyncPushPermissionDeniedException extends SyncPushRefusalException
{
    public const REASON = 'permission_denied';
}
