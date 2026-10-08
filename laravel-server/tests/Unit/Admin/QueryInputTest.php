<?php

namespace Tests\Unit\Admin;

use App\Services\Admin\Support\QueryInput;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class QueryInputTest extends TestCase
{
    #[Test]
    public function it_passes_a_string_through_unchanged(): void
    {
        $this->assertSame('alpha', QueryInput::stringOrNull('alpha'));
    }

    #[Test]
    public function it_keeps_an_empty_string_as_an_empty_string(): void
    {
        $this->assertSame('', QueryInput::stringOrNull(''));
    }

    #[Test]
    public function it_returns_null_for_null(): void
    {
        $this->assertNull(QueryInput::stringOrNull(null));
    }

    #[Test]
    public function it_returns_null_for_a_list_array(): void
    {
        $this->assertNull(QueryInput::stringOrNull(['a', 'b']));
    }

    #[Test]
    public function it_returns_null_for_an_associative_array(): void
    {
        $this->assertNull(QueryInput::stringOrNull(['name' => 'asc']));
    }

    #[Test]
    public function it_returns_null_for_an_int(): void
    {
        $this->assertNull(QueryInput::stringOrNull(42));
    }
}
