<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->string('editing_device_id')->nullable()->after('notes');
            $table->string('editing_device_label')->nullable()->after('editing_device_id');
            $table->uuid('editing_user_id')->nullable()->after('editing_device_label');
            $table->string('editing_at')->nullable()->after('editing_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropColumn(['editing_device_id', 'editing_device_label', 'editing_user_id', 'editing_at']);
        });
    }
};
