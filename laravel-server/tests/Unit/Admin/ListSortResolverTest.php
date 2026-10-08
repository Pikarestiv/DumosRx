<?php

namespace Tests\Unit\Admin;

use App\Services\Admin\Support\ListSortResolver;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ListSortResolverTest extends TestCase
{
    #[Test]
    public function it_resolves_each_allow_listed_store_column(): void
    {
        $this->assertSame(['stores.name'], ListSortResolver::storeColumns('name'));
        $this->assertSame(['stores.created_at'], ListSortResolver::storeColumns('created_at'));
        $this->assertSame(['stores.status'], ListSortResolver::storeColumns('status'));
        $this->assertSame(['total_revenue'], ListSortResolver::storeColumns('total_revenue'));
    }

    #[Test]
    public function it_resolves_each_allow_listed_user_column(): void
    {
        $this->assertSame(['users.first_name', 'users.last_name'], ListSortResolver::userColumns('name'));
        $this->assertSame(['users.email'], ListSortResolver::userColumns('email'));
        $this->assertSame(['users.created_at'], ListSortResolver::userColumns('created_at'));
        $this->assertSame(['users.last_login_at'], ListSortResolver::userColumns('last_login_at'));
        $this->assertSame(['users.role'], ListSortResolver::userColumns('role'));
    }

    #[Test]
    public function it_rejects_columns_that_are_computed_after_the_query(): void
    {
        $this->assertSame([], ListSortResolver::storeColumns('plan'));
        $this->assertSame([], ListSortResolver::storeColumns('owner'));
        $this->assertSame([], ListSortResolver::userColumns('last_sync'));
        $this->assertSame([], ListSortResolver::userColumns('store'));
    }

    #[Test]
    public function it_rejects_hostile_sort_values(): void
    {
        $hostile = [
            'name; DROP TABLE users',
            'users.password',
            '(SELECT 1)',
            'name,email',
            'NAME',
            str_repeat('a', 10000),
            '',
            null,
            ['name'],
            ['name' => 'asc'],
        ];

        foreach ($hostile as $value) {
            $this->assertSame([], ListSortResolver::storeColumns($value), 'store: '.var_export($value, true));
            $this->assertSame([], ListSortResolver::userColumns($value), 'user: '.var_export($value, true));
        }
    }

    #[Test]
    public function it_defaults_direction_to_desc_and_only_accepts_an_exact_asc(): void
    {
        $this->assertSame('asc', ListSortResolver::direction('asc'));
        $this->assertSame('desc', ListSortResolver::direction('desc'));
        $this->assertSame('desc', ListSortResolver::direction('ASC'));
        $this->assertSame('desc', ListSortResolver::direction('ascending'));
        $this->assertSame('desc', ListSortResolver::direction(null));
        $this->assertSame('desc', ListSortResolver::direction(''));
    }
}
