<?php

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';

use App\Models\User;
use App\Models\Store;
use App\Models\Role;
use App\Models\Permission;

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "=== ROLES IN DB ===\n";
foreach (Role::all() as $role) {
    echo "- Role: {$role->slug} (ID: {$role->id})\n";
    foreach ($role->permissions as $p) {
        echo "  - Permission: {$p->slug}\n";
    }
}

echo "\n=== STORE INSPECT ===\n";
$storeId = 'd32894c8-8c64-42fb-af47-a3e44b8fc688';
$store = Store::find($storeId);
if ($store) {
    echo "Store: {$store->name} (Owner User ID: {$store->user_id})\n";
    $owner = $store->user;
    if ($owner) {
        echo "Owner: {$owner->first_name} {$owner->last_name} ({$owner->email})\n";
        echo "Owner Role Column: {$owner->role}\n";
        echo "Owner Role ID Column: {$owner->role_id}\n";
        echo "Owner hasPermission('manage_staff'): " . ($owner->hasPermission('manage_staff') ? 'TRUE' : 'FALSE') . "\n";
    } else {
        echo "No owner user found for store.\n";
    }
} else {
    echo "Store not found in DB with ID: {$storeId}\n";
}

echo "\n=== ALL USERS ===\n";
foreach (User::all() as $u) {
    echo "User: {$u->first_name} {$u->last_name} ({$u->email}) | Role: {$u->role} | role_id: {$u->role_id} | manage_staff: " . ($u->hasPermission('manage_staff') ? 'TRUE' : 'FALSE') . "\n";
}
