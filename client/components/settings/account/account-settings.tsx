"use client";

import { ProfileSettings } from "./profile-settings";
import { SessionsList } from "./sessions-list";
import { AccountDangerZone } from "./account-danger-zone";

export function AccountSettings() {
  return (
    <div className="space-y-6">
      <ProfileSettings />
      <SessionsList />
      <AccountDangerZone />
    </div>
  );
}
