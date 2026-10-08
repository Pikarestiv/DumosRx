<?php

namespace App\Services\Admin\Support;

class ListSortResolver
{
    /** @return list<string> */
    public static function storeColumns(mixed $sort): array
    {
        return match ($sort) {
            'name' => ['stores.name'],
            'created_at' => ['stores.created_at'],
            'status' => ['stores.status'],
            'total_revenue' => ['total_revenue'],
            default => [],
        };
    }

    /** @return list<string> */
    public static function userColumns(mixed $sort): array
    {
        return match ($sort) {
            'name' => ['users.first_name', 'users.last_name'],
            'email' => ['users.email'],
            'created_at' => ['users.created_at'],
            'last_login_at' => ['users.last_login_at'],
            'role' => ['users.role'],
            default => [],
        };
    }

    public static function direction(mixed $direction): string
    {
        return $direction === 'asc' ? 'asc' : 'desc';
    }
}
