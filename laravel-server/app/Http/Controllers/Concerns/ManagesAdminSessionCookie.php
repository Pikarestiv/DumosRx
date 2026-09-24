<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;

/**
 * The single place that builds or clears the `drx_admin_session` cookie
 * (HttpOnly, SameSite=Strict — see buildAdminSessionCookie()'s own comment
 * for why Strict specifically). Extracted from AuthenticatesSessions so
 * every other call site that needs to touch this cookie (AdminStoreController's
 * impersonation flow) goes through the same hardened attributes instead of
 * hand-rolling its own `cookie(...)` call — three separate hand-rolled
 * copies (AuthenticatesSessions::refresh(), AdminStoreController::
 * impersonateStore()/restoreSession()) previously each used the pre-2026-08-26-
 * redesign SameSite=None pattern with a general-ability token, silently
 * undoing the hardening `login()`/`refreshAdminSession()` correctly apply.
 * See docs/FIXED_BUGS.md for the incident.
 */
trait ManagesAdminSessionCookie
{
    private function adminSessionCookieDomain(Request $request): ?string
    {
        return $request->getHost() === 'localhost' || filter_var($request->getHost(), FILTER_VALIDATE_IP)
            ? null
            : '.' . implode('.', array_slice(explode('.', $request->getHost()), -2));
    }

    private function buildAdminSessionCookie(Request $request, string $value)
    {
        return cookie(
            'drx_admin_session',
            $value,
            60 * 24,
            '/',
            $this->adminSessionCookieDomain($request),
            $request->isSecure(),
            true, // httpOnly
            false,
            // Strict: this cookie only ever needs to be sent to our own
            // /admin/session/refresh endpoint from our own admin panel, so
            // it never needs to travel cross-site. Closes off the
            // CSRF-shaped hole the old SameSite=None + global
            // cookie-to-header promotion combination left open.
            'Strict'
        );
    }

    private function forgetAdminSessionCookie(Request $request)
    {
        return cookie(
            'drx_admin_session',
            '',
            -1,
            '/',
            $this->adminSessionCookieDomain($request),
            $request->isSecure(),
            true,
            false,
            'Strict'
        );
    }
}
