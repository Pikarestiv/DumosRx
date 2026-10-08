<?php

namespace App\Services\Admin\Filters;

use Illuminate\Http\Request;

class StoreListFilters
{
    public function __construct(
        public readonly int $page = 1,
        public readonly ?string $search = null,
        public readonly ?string $status = null,
        public readonly ?string $plan = null,
        public readonly string $archived = 'active',
        public readonly string $demo = 'all',
        public readonly mixed $sort = null,
        public readonly mixed $direction = null,
        public readonly bool $includeRevenue = false,
    ) {}

    public static function fromRequest(Request $request, bool $includeRevenue): self
    {
        return new self(
            page: max(1, (int) $request->query('page', 1)),
            search: $request->query('search'),
            status: $request->query('status'),
            plan: $request->query('plan'),
            archived: in_array($request->query('archived'), ['only', 'all'], true)
                ? $request->query('archived')
                : 'active',
            demo: in_array($request->query('demo'), ['only', 'exclude'], true)
                ? $request->query('demo')
                : 'all',
            sort: $request->query('sort'),
            direction: $request->query('direction'),
            includeRevenue: $includeRevenue,
        );
    }
}
