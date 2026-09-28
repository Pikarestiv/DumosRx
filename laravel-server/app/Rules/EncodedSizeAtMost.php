<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Caps an arbitrary-shaped field by its JSON-encoded byte size, which
 * Laravel's `max:` (an element count on arrays) cannot express. */
class EncodedSizeAtMost implements ValidationRule
{
    public function __construct(private int $maxBytes)
    {
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null) {
            return;
        }

        $encoded = json_encode($value);

        if ($encoded === false || strlen($encoded) > $this->maxBytes) {
            $fail("The :attribute field may not be larger than {$this->maxBytes} bytes.");
        }
    }
}
