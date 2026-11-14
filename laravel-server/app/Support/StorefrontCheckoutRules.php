<?php

namespace App\Support;

final class StorefrontCheckoutRules
{
    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        return [
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:50',
            'customer_email' => 'nullable|email|max:255',
            'customer_address' => 'nullable|string|max:1000|required_if:fulfilment_method,delivery',
            'fulfilment_method' => 'sometimes|in:pickup,delivery',
            'payment_method' => 'required|in:paystack,transfer,in_store',
            'paystack_reference' => [
                'required_if:payment_method,paystack',
                'nullable',
                'string',
                'prohibited_unless:payment_method,paystack',
            ],
            'branch_id' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|uuid|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
        ];
    }
}
