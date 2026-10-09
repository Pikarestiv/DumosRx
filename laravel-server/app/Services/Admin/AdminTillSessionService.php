<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\Hash;

class AdminTillSessionService
{
    public const ELIGIBLE_ROLES = ['platform_admin', 'super_admin'];

    public const CODE_LENGTH = 12;

    /** Bounds how many codes verify() will ever test; see EQUALIZED_CHECKS. */
    public const EQUALIZED_CHECKS = 3;

    public function generateCode(): string
    {
        return str_pad(
            (string) random_int(0, (10 ** self::CODE_LENGTH) - 1),
            self::CODE_LENGTH,
            '0',
            STR_PAD_LEFT,
        );
    }

    public function hashCode(string $code): string
    {
        return Hash::make($code);
    }
}
