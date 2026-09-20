<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\AuthenticatesSessions;
use App\Http\Controllers\Api\Concerns\ManagesProfile;
use App\Http\Controllers\Api\Concerns\RecoversPasswords;
use App\Http\Controllers\Api\Concerns\RegistersAccounts;

/**
 * Every auth endpoint still lives on THIS class: the method bodies were
 * moved verbatim into the four Concerns traits below purely to make a
 * ~900-line file navigable. No method signature, route binding or
 * middleware group changed.
 *
 * Traits rather than separate controller classes, deliberately. Every
 * AuthController route's middleware is assigned by route GROUP in
 * routes/api.php, and those routes are split across three different groups
 * (`throttle:auth` for login/register/verify/password flows,
 * `throttle:session-refresh` for the admin session refresh, and the
 * `auth:sanctum` + account_status + EnsureEmailIsVerified protected group
 * for the rest). Splitting into new controller classes would mean rewriting
 * those bindings — the one thing a pure reorganization of security-critical
 * code must not risk getting wrong. There is also no controller-level or
 * method-level middleware here for a trait to obscure: this class has no
 * constructor and never called `$this->middleware()`.
 *
 * - AuthenticatesSessions: login, logout, refresh, refreshAdminSession,
 *   user, plus the private admin-session-cookie builders.
 * - RegistersAccounts: register, verifyEmail, resendVerification.
 * - RecoversPasswords: forgotPassword, resetPassword.
 * - ManagesProfile: updateProfile, updatePin, changePassword,
 *   requestDeletion, cancelDeletion.
 */
class AuthController extends Controller
{
    use AuthenticatesSessions;
    use ManagesProfile;
    use RecoversPasswords;
    use RegistersAccounts;
}
