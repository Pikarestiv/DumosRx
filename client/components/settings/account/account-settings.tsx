"use client";

import { ProfileSettings } from "./profile-settings";
import { SessionsList } from "./sessions-list";
import { AccountDangerZone } from "./account-danger-zone";

export function AccountSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Account</h1>
        <p className="text-muted-foreground">Manage your personal information, sessions, and account settings</p>
      </div>

      <ProfileSettings />
      <SessionsList />
      <AccountDangerZone />
    </div>
  );
}
