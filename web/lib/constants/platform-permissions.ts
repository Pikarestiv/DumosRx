export interface PlatformPermissionOption {
  value: string;
  label: string;
  description: string;
}

/** Must match User::DELEGATABLE_PERMISSIONS in laravel-server/app/Models/User.php. */
export const PLATFORM_PERMISSION_OPTIONS: readonly PlatformPermissionOption[] = [
  { value: "view_platform_data", label: "View Platform Data", description: "View stores, platform users and activity logs" },
  { value: "send_notifications", label: "Send Notifications", description: "Send user notifications and manage broadcasts" },
  { value: "reset_user_passwords", label: "Reset Passwords", description: "Force-reset a user's password" },
  { value: "manage_account_status", label: "Manage Account Status", description: "Suspend or reactivate a store or user" },
  { value: "impersonate_store", label: "Store Impersonation", description: "View a store's data as if logged in as them" },
] as const;
