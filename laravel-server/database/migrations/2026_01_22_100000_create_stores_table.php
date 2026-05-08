<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $blueprint) {
            $blueprint->uuid('id')->primary();
            $blueprint->foreignId('user_id')->constrained()->onDelete('cascade');
            $blueprint->string('name');
            $blueprint->string('location')->nullable();
            $blueprint->string('device_id')->unique();
            $blueprint->timestamp('last_sync_at')->nullable();
            $blueprint->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stores');
    }
};
