<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;

/**
 * Bounded `?limit=` handling for the app's paginated list endpoints. See
 * .agents/AGENTS.md §8 for the 50-item cap; the unvalidated value used to
 * reach paginate() raw, where a negative limit produced a MySQL syntax
 * error (a 500) and a huge one loaded the whole table into memory.
 */
trait ValidatesPaginationLimit
{
    private const DEFAULT_PAGE_LIMIT = 50;

    private const MAX_PAGE_LIMIT = 50;

    protected function paginationLimit(Request $request): int
    {
        $request->validate([
            'limit' => 'sometimes|integer|min:1|max:'.self::MAX_PAGE_LIMIT,
        ]);

        return (int) $request->get('limit', self::DEFAULT_PAGE_LIMIT);
    }
}
