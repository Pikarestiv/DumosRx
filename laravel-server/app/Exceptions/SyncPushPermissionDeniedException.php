<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown by SyncController::sanitizePermissionGroupSyncPayload() when a push
 * fails a privilege check. Its own type so push()'s per-change catch can
 * report the stable, machine-checkable `permission_denied` reason the client
 * treats as terminal, while the exception message still carries the specific
 * detail into the log.
 *
 * See client/AGENTS.md's "Catalog versioning and the default-group backfill"
 * for why this failure class is terminal rather than retryable.
 */
class SyncPushPermissionDeniedException extends RuntimeException
{
    public const REASON = 'permission_denied';
}
