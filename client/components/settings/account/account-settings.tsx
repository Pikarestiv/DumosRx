"use client";

import { ProfileSettings } from "./profile-settings";
import { SessionsList } from "./sessions-list";

export function AccountSettings() {
  return (
    <div className="space-y-6">
      <ProfileSettings />
      <SessionsList />
    </div>
  );
}
