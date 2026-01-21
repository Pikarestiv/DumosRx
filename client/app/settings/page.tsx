import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your pharmacy configuration and preferences
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">General Configuration</h2>
          <p className="text-gray-500 mb-4">
            System settings will appear here.
          </p>
          <Button>Save Changes</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
