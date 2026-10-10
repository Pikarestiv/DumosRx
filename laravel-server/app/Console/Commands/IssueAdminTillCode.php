<?php

namespace App\Console\Commands;

use App\Models\AdminTillCode;
use App\Models\User;
use App\Services\Admin\AdminTillSessionService;
use Illuminate\Console\Command;

class IssueAdminTillCode extends Command
{
    protected $signature = 'admin:till-code {email} {--revoke} {--label=}';

    protected $description = 'Issue or revoke an admin till access code for on-till read-only inspection';

    public function __construct(private AdminTillSessionService $sessions)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $admin = User::where('email', $this->argument('email'))->first();

        if (!$admin || !$admin->is_active
            || !$admin->hasRole(AdminTillSessionService::ELIGIBLE_ROLES)) {
            $this->error('No platform admin with that email.');

            return 1;
        }

        if ($this->option('revoke')) {
            $count = AdminTillCode::active()
                ->where('admin_id', $admin->id)
                ->update(['revoked_at' => now()]);

            $this->info("Revoked {$count} code(s) for {$admin->email}.");

            return 0;
        }

        $active = AdminTillCode::active()->where('admin_id', $admin->id)->count();

        if ($active >= AdminTillSessionService::EQUALIZED_CHECKS) {
            $this->error(
                'Three active codes is the maximum; revoke one first with --revoke.',
            );

            return 1;
        }

        $code = $this->sessions->generateCode();

        AdminTillCode::create(
            $this->sessions->newCodeAttributes($code, $admin->id, $this->option('label')),
        );

        $this->info("Till access code for {$admin->email}: {$code}");
        $this->warn('Shown once here; a super admin can re-read it from the admin panel.');

        return 0;
    }
}
