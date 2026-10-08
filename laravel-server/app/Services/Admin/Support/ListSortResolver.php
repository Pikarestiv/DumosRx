<?php

namespace App\Services\Admin\Support;

/**
 * Turns a request's `sort`/`direction` pair into real column names. The
 * match arms ARE the allow-list: an unrecognised key returns no columns and
 * the caller keeps its default ordering, so no request value can reach
 * orderBy(). See docs/superpowers/specs/2026-10-08-admin-panel-improvements-design.md
 * for which visible columns are deliberately absent and why.
 *
 * @return list<string>
 */
class ListSortResolver
{
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
