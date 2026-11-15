<?php

namespace Tests\Unit;

use App\Models\User;
use PHPUnit\Framework\TestCase;

class DeletedUserSuffixTest extends TestCase
{
    public function test_two_deletions_in_the_same_instant_never_share_a_suffix(): void
    {
        $suffixes = array_map(fn () => User::deletedSuffix(), range(1, 50));

        $this->assertCount(50, array_unique($suffixes));
        $this->assertMatchesRegularExpression('/^_del_\d{13}$/', $suffixes[0]);
    }
}
