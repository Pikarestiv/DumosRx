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

        foreach ($accounts as $account) {
            PaymentAccount::firstOrCreate(
                ['name' => $account['name']],
                $account
            );
        }
    }
}
