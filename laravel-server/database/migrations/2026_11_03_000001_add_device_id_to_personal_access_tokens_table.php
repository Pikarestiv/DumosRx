<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            if (! Schema::hasColumn('personal_access_tokens', 'device_id')) {
                $table->string('device_id', 64)->nullable()->after('name');
            }
        });

        // Backfill existing tokens so every session has a device_id.
        $tokens = DB::table('personal_access_tokens')->whereNull('device_id')->get();
        foreach ($tokens as $token) {
            $userDevice = DB::table('user_devices')
                ->where('user_id', $token->tokenable_id)
                ->orderByDesc('last_synced_at')
                ->first();

            if ($userDevice && $token->name !== 'web') {
                $deviceId = $userDevice->device_id;
            } else {
                $prefix = $token->name === 'web' ? 'DRX-WEB-' : 'DRX-';
                $deviceId = $prefix.strtoupper(Str::random(9));
            }

            DB::table('personal_access_tokens')
                ->where('id', $token->id)
                ->update(['device_id' => $deviceId]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            if (Schema::hasColumn('personal_access_tokens', 'device_id')) {
                $table->dropColumn('device_id');
            }
        });
    }
};
