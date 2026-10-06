<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_health_daily', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id')->nullable();
            $table->date('date');
            $table->unsignedInteger('pushes')->default(0);
            $table->unsignedInteger('changes_accepted')->default(0);
            $table->unsignedInteger('changes_refused')->default(0);
            $table->timestamps();

            $table->unique(['store_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_health_daily');
    }
};
