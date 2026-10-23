<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('personal_access_tokens')
            ->whereNull('expires_at')
            ->select(['id', 'created_at'])
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $issuedAt = $row->created_at ? Carbon::parse($row->created_at, 'UTC') : now();

                    DB::table('personal_access_tokens')->where('id', $row->id)->update([
                        'expires_at' => $issuedAt->addDays(30)->toDateTimeString(),
                    ]);
                }
            });
    }

    public function down(): void
    {
    }
};
