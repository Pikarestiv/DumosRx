import { DashboardViewRedirect } from "./redirect-client";

// web/'s own dashboard is gone; every deep link (e.g. /dashboard/staff,
// /dashboard/billing) redirects to app.dumosrx.com's root rather than to a
// specific tab, since the old view names don't map 1:1 onto client/'s
// Settings tabs and client/'s own nav gets the user the rest of the way.
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { view: ["overview"] },
    { view: ["fleet"] },
    { view: ["store-details"] },
    { view: ["staff"] },
    { view: ["staff", "management"] },
    { view: ["staff", "activities"] },
    { view: ["billing"] },
    { view: ["downloads"] },
    { view: ["notifications"] },
    { view: ["profile"] },
    { view: ["support"] },
  ];
}

export default function DashboardViewRedirectPage() {
  return <DashboardViewRedirect />;
}
