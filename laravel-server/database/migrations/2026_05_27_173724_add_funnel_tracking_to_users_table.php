<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->integer('setup_reminder_level')->default(0)->after('last_login_at');
            $table->timestamp('setup_reminder_last_sent_at')->nullable()->after('setup_reminder_level');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['setup_reminder_level', 'setup_reminder_last_sent_at']);
        });
    }
};
