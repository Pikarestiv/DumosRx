<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminMaintenanceService;
use Illuminate\Support\Facades\Auth;

class AdminMaintenanceController extends AdminBaseController
{
    public function __construct(private AdminMaintenanceService $maintenance) {}

    public function migrations()
    {
        return response()->json($this->maintenance->migrationStatus());
    }

    public function runMigrations()
    {
        $result = $this->maintenance->runPendingMigrations(Auth::id());

        return response()->json($result, $result['ok'] ? 200 : 500);
    }

    public function syncRoles()
    {
        $result = $this->maintenance->syncRolesAndPermissions(Auth::id());

        return response()->json($result, $result['ok'] ? 200 : 500);
    }
}
