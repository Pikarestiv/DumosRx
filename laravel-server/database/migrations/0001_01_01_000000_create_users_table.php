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
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('password'); // Corresponds to password_hash
            $table->string('first_name');
            $table->string('last_name');
            $table->string('phone')->nullable();
            
            // Legacy role column mirroring, nullable if we transition to pure RBAC
            // Keeping it for now to ease migration from Postgres ENUM
            $table->string('role')->default('pharmacist'); 

            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            
            // New foreign key for robust RBAC
            // $table->foreignId('role_id')->nullable()->constrained(); 
            // We will add role_id in a separate migration after roles table exists if needed, 
            // or just rely on the 'role' string if the system is simple.
            // Plan said "Create User, Role, and Permission models". 
            // So we should probably link them. 
            // Let's add role_id here assuming roles table helps manage permissions.
            // But we can't add constraint if roles table isn't created yet or if we want to defer.
            // Let's stick to mirroring first. The legacy system relied on the string.
            
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignUuid('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
