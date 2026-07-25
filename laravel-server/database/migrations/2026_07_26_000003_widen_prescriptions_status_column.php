<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // status is a legacy enum from the original schema: ['pending',
        // 'dispensed', 'substituted', 'unavailable']. The client has moved
        // on to a much wider set of statuses (in_progress, ready, completed,
        // on_hold, partially_dispensed, cancelled, ...) that don't fit the
        // enum, so MySQL truncates/rejects every push using one of them.
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->string('status')->default('pending')->change();
        });
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->enum('status', ['pending', 'dispensed', 'substituted', 'unavailable'])->default('pending')->change();
        });
    }
};
