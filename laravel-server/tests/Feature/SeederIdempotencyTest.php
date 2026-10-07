<?php

namespace Tests\Feature;

use App\Models\EmailTemplate;
use App\Models\SystemConfig;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\SystemConfigSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Until Phase 5, production's migration path ran `migrate --seed --force`
 * on every deploy, so a seeder that wrote unconditionally reverted whatever
 * a super-admin had edited through the admin panel since the last deploy —
 * see docs/FIXED_BUGS.md (A-2). Migrating no longer seeds, but this
 * requirement stands and matters just as much: `RolesAndPermissionsSeeder`
 * is still invoked directly by the Maintenance page's "sync roles and
 * permissions" action. Every seeder reachable from DatabaseSeeder must be
 * idempotent-if-present: it seeds a missing row, it never overwrites an
 * existing one.
 */
class SeederIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_re_seed_does_not_revert_admin_edited_system_configs()
    {
        (new SystemConfigSeeder())->run();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['pro' => ['price_monthly' => 12000]]]);
        SystemConfig::setVal('global_suggestions', ['amoxicillin', 'paracetamol']);
        SystemConfig::setVal('referral_program', ['enabled' => false, 'reward_percentage' => 2.5]);
        SystemConfig::setVal('smartsupp_key', 'admin-configured-widget-key');

        (new SystemConfigSeeder())->run();

        $this->assertSame(
            12000,
            SystemConfig::where('key', 'subscription_plans')->value('value')['tiers']['pro']['price_monthly'],
            'A re-seed reverted admin-edited plan pricing.'
        );
        $this->assertSame(
            ['amoxicillin', 'paracetamol'],
            SystemConfig::where('key', 'global_suggestions')->value('value'),
            'A re-seed blanked the admin-edited global suggestions.'
        );
        $this->assertFalse(
            SystemConfig::where('key', 'referral_program')->value('value')['enabled'],
            'A re-seed reverted the admin-edited referral program settings.'
        );
        $this->assertSame(
            'admin-configured-widget-key',
            SystemConfig::where('key', 'smartsupp_key')->value('value'),
            'A re-seed cleared the admin-configured Smartsupp key.'
        );
    }

    public function test_a_re_seed_does_not_revert_admin_edited_email_templates()
    {
        (new EmailTemplateSeeder())->run();

        EmailTemplate::where('key', 'welcome')->update([
            'subject' => 'Admin-edited subject',
            'content' => 'Admin-edited content',
        ]);

        (new EmailTemplateSeeder())->run();

        $template = EmailTemplate::where('key', 'welcome')->firstOrFail();
        $this->assertSame('Admin-edited subject', $template->subject, 'A re-seed reverted an admin-edited email template subject.');
        $this->assertSame('Admin-edited content', $template->content, 'A re-seed reverted an admin-edited email template body.');
    }

    public function test_seeders_still_create_missing_rows_on_a_first_install()
    {
        (new SystemConfigSeeder())->run();
        (new EmailTemplateSeeder())->run();

        foreach (['subscription_plans', 'global_suggestions', 'referral_program', 'smartsupp_key'] as $key) {
            $this->assertDatabaseHas('system_configs', ['key' => $key]);
        }

        foreach (['welcome', 'password_reset', 'notification', 'email_verification'] as $key) {
            $this->assertDatabaseHas('email_templates', ['key' => $key]);
        }

        $this->assertSame(
            8000,
            SystemConfig::where('key', 'subscription_plans')->value('value')['tiers']['pro']['price_monthly']
        );
    }

    public function test_a_re_seed_restores_a_key_that_has_been_deleted()
    {
        (new SystemConfigSeeder())->run();
        SystemConfig::where('key', 'referral_program')->delete();

        (new SystemConfigSeeder())->run();

        $this->assertTrue(SystemConfig::where('key', 'referral_program')->value('value')['enabled']);
    }
}
