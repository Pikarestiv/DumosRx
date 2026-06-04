<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Starter Plan
        DB::table('subscriptions')
            ->whereIn('plan_name', ['Starter', 'basic', 'Dumos Local', 'local', 'Starter Plan', 'Basic Plan'])
            ->update(['plan_name' => 'starter']);

        // Pro Plan
        DB::table('subscriptions')
            ->whereIn('plan_name', ['Pro', 'Dumos Pro', 'Professional', 'Pro Plan'])
            ->update(['plan_name' => 'pro']);

        // Enterprise Plan
        DB::table('subscriptions')
            ->whereIn('plan_name', ['Enterprise', 'Enterprise Plan'])
            ->update(['plan_name' => 'enterprise']);

        // Free Plan
        DB::table('subscriptions')
            ->whereIn('plan_name', ['Free', 'free plan', 'basic free'])
            ->update(['plan_name' => 'free']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Reversing this is not fully deterministic as we lose the exact previous legacy names.
        // But for completeness, we can map back to the most common legacy names.
        DB::table('subscriptions')->where('plan_name', 'starter')->update(['plan_name' => 'Starter']);
        DB::table('subscriptions')->where('plan_name', 'pro')->update(['plan_name' => 'Pro']);
        DB::table('subscriptions')->where('plan_name', 'enterprise')->update(['plan_name' => 'Enterprise']);
        DB::table('subscriptions')->where('plan_name', 'free')->update(['plan_name' => 'Free']);
    }
};
