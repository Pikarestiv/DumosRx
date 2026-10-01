<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminRoleController extends AdminBaseController
{
    public function __construct(private AdminRoleService $adminRoleService)
    {
    }

    public function index()
    {
        return $this->withErrorResponse('List Roles', 'Failed to list roles', function () {
            return response()->json(['roles' => $this->adminRoleService->listRoles()]);
        });
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|min:2|max:100',
            'permissions' => 'present|array',
            'permissions.*' => [Rule::in(User::DELEGATABLE_PERMISSIONS)],
        ]);

        return $this->withErrorResponse('Create Role', 'Failed to create role', function () use ($validated, $request) {
            $role = $this->adminRoleService->createRole($validated['name'], $validated['permissions'], $request->user()->id);
            return response()->json(['role' => $role->load('permissions')], 201);
        });
    }

    public function updatePermissions(Request $request, string $role)
    {
        $validated = $request->validate([
            'permissions' => 'present|array',
            'permissions.*' => [Rule::in(User::DELEGATABLE_PERMISSIONS)],
        ]);

        return $this->withErrorResponse('Update Role Permissions', 'Failed to update role permissions', function () use ($validated, $role, $request) {
            $updated = $this->adminRoleService->updateRolePermissions($role, $validated['permissions'], $request->user()->id);
            return response()->json(['role' => $updated]);
        });
    }

    public function destroy(Request $request, string $role)
    {
        return $this->withErrorResponse('Delete Role', 'Failed to delete role', function () use ($role, $request) {
            $this->adminRoleService->deleteRole($role, $request->user()->id);
            return response()->json(['message' => 'Role deleted']);
        });
    }

    public function updateUserPermissionOverrides(Request $request, string $id)
    {
        $validated = $request->validate([
            'overrides' => 'required|array',
            'overrides.*' => 'nullable|boolean',
        ]);

        $unknownKeys = array_diff(array_keys($validated['overrides']), User::DELEGATABLE_PERMISSIONS);
        if ($unknownKeys) {
            return response()->json(['message' => 'Unknown permission(s): ' . implode(', ', $unknownKeys)], 422);
        }

        return $this->withErrorResponse('Update User Permission Overrides', 'Failed to update permission overrides', function () use ($validated, $id, $request) {
            $user = null;
            foreach ($validated['overrides'] as $slug => $granted) {
                $user = $this->adminRoleService->setUserPermissionOverride($id, $slug, $granted, $request->user()->id);
            }
            $target = $user ?? User::findOrFail($id);
            return response()->json(['user' => $target->append('effective_permissions')]);
        });
    }
}
