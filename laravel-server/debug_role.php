<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';

use App\Models\User;
use Illuminate\Support\Facades\Gate;

$user = new User();
$user->role = 'admin';

echo "Role Attribute: " . $user->role . "\n";
echo "Is String: " . (is_string($user->role) ? 'Yes' : 'No') . "\n";
echo "Type: " . gettype($user->role) . "\n";

$gateResult = Gate::forUser($user)->allows('manage-staff');
echo "Gate allows 'admin': " . ($gateResult ? 'Yes' : 'No') . "\n";
