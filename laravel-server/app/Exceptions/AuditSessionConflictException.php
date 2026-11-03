<?php

namespace App\Exceptions;

use App\Models\AuditSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditSessionConflictException extends \RuntimeException
{
    protected ?AuditSession $session;

    public function __construct(string $message, ?AuditSession $session = null, int $code = 409, ?\Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
        $this->session = $session;
    }

    public function getSession(): ?AuditSession
    {
        return $this->session;
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'conflict' => true,
            'session' => $this->session,
        ], 409);
    }
}

