<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DeviceNicknameService
{
    public function set(string $storeId, string $deviceId, ?string $nickname): void
    {
        $nickname = trim((string) $nickname);

        if ($nickname === '') {
            DB::table('device_nicknames')
                ->where('store_id', $storeId)
                ->where('device_id', $deviceId)
                ->delete();

            return;
        }

        DB::table('device_nicknames')->upsert(
            [[
                'id' => (string) Str::uuid(),
                'store_id' => $storeId,
                'device_id' => $deviceId,
                'nickname' => $nickname,
                'created_at' => now(),
                'updated_at' => now(),
            ]],
            ['store_id', 'device_id'],
            ['nickname', 'updated_at'],
        );
    }
}
