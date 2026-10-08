<?php

namespace App\Services\Admin\Filters;

use Illuminate\Http\Request;

class UserListFilters
{
    public function __construct(
        public readonly int $page = 1,
        public readonly ?string $search = null,
        public readonly ?string $role = null,
        public readonly ?string $accountType = null,
        public readonly ?string $storeId = null,
        public readonly mixed $sort = null,
        public readonly mixed $direction = null,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public static function fromRequest(Request $request, array $validated): self
    {
        return new self(
            page: max(1, (int) $request->query('page', 1)),
            search: $request->query('search'),
            role: $request->query('role'),
            accountType: $validated['account_type'] ?? null,
            storeId: $validated['store_id'] ?? null,
            sort: $request->query('sort'),
            direction: $request->query('direction'),
        );
    }
}
