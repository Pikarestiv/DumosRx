import Link from "next/link";
import { ArrowLeft, ShieldAlert, Key, Globe, Eye } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-16 px-4 sm:px-6 lg:px-8">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto z-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-primary hover:underline group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to home
        </Link>

        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight font-serif text-slate-900 dark:text-white">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last Updated: May 26, 2026
          </p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <div className="p-6 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex items-start gap-4">
            <ShieldAlert className="h-6 w-6 text-indigo-500 shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                DumosRx Offline First Architecture
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Your stock inventory, customer records, and sales data are
                stored locally on your device. We do not inspect, sell, or run
                advertising targeting based on your local database.
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-500" />
              1. Information We Collect
            </h2>
            <p>
              When you register a DumosRx account or use our cloud sync
              features, we collect the following basic information:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Account Credentials:</strong> Full name, business email,
                username, and hashed PIN/password.
              </li>
              <li>
                <strong>Business Information:</strong> Store/store name,
                location (city/state), phone number, and licensing credentials.
              </li>
              <li>
                <strong>Payment Information:</strong> Billing records,
                transaction identifiers, and subscription history.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="h-5 w-5 text-indigo-500" />
              2. How We Use Information
            </h2>
            <p>We process information for the following specific purposes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provision and manage your cloud backup capabilities.</li>
              <li>
                To synchronize your offline databases across authorized client
                applications.
              </li>
              <li>
                To verify compliance with our licensing parameters and prevent
                abusive behavior.
              </li>
              <li>
                To process transaction invoices via our designated payment
                processors.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-indigo-500" />
              3. Data Security & Storage
            </h2>
            <p>
              All remote data synchronization transmissions are encrypted using
              standard secure protocols. Databases backed up to our cloud
              endpoints are stored securely with restricted access controls. We
              strongly encourage all users to configure robust local PINs to
              protect client databases from unauthorized device access.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              4. Contact Us
            </h2>
            <p>
              If you have any questions or concerns regarding our privacy
              practices, please contact our support team at{" "}
              <a
                href="mailto:support@dumosrx.com"
                className="text-primary hover:underline"
              >
                support@dumosrx.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
