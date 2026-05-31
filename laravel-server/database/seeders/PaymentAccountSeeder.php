<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\PaymentAccount;

class PaymentAccountSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $accounts = [
            [
                'name' => 'Main Cash Drawer',
                'account_type' => 'cash',
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'name' => 'Zenith Bank POS',
                'account_type' => 'card',
                'bank_name' => 'Zenith Bank',
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'name' => 'Moniepoint Terminal',
                'account_type' => 'transfer',
                'bank_name' => 'Moniepoint',
                'account_number' => '5432198765',
                'is_active' => true,
                'sort_order' => 3,
            ]
        ];

        $store = \App\Models\Store::first();
        $userId = $store ? $store->user_id : null;
        $storeId = $store ? $store->id : null;

        foreach ($accounts as $account) {
            PaymentAccount::firstOrCreate(
                [
                    'name' => $account['name'],
                    'store_id' => $storeId,
                ],
                array_merge($account, [
                    'user_id' => $userId,
                    'store_id' => $storeId,
                ])
            );
        }
    }
}
