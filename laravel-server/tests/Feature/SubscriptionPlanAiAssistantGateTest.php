<?php

namespace Tests\Feature;

use App\Models\SystemConfig;
use Database\Seeders\SystemConfigSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The in-app assistant is plan-gated client-side (client/'s useFeatureGate
 * reads `ai_assistant` out of the synced subscription_plans config). The
 * seeded config mirrors production, where free and starter omit the key and
 * the client's own default (Pro and Enterprise only) withholds it.
 */
class SubscriptionPlanAiAssistantGateTest extends TestCase
{
    use RefreshDatabase;

    private function seededTiers(): array
    {
        (new SystemConfigSeeder)->run();

        return SystemConfig::where('key', 'subscription_plans')->value('value')['tiers'];
    }

    public function test_the_seeded_plans_withhold_the_assistant_from_free_and_starter()
    {
        $tiers = $this->seededTiers();

        $this->assertFalse($tiers['free']['features']['ai_assistant'] ?? false);
        $this->assertFalse($tiers['starter']['features']['ai_assistant'] ?? false);
    }

    public function test_the_seeded_plans_grant_the_assistant_to_pro_and_enterprise()
    {
        $tiers = $this->seededTiers();

        $this->assertTrue($tiers['pro']['features']['ai_assistant']);
        $this->assertTrue($tiers['enterprise']['features']['ai_assistant']);
    }

    public function test_the_assistant_follows_the_same_tier_split_as_smart_suggestions()
    {
        $tiers = $this->seededTiers();

        foreach (['free', 'starter', 'pro', 'enterprise'] as $tier) {
            $this->assertSame(
                $tiers[$tier]['features']['smart_suggestions'] ?? false,
                $tiers[$tier]['features']['ai_assistant'] ?? false,
                "The {$tier} tier's ai_assistant flag drifted from its smart_suggestions precedent."
            );
        }
    }
}
