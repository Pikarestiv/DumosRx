import Link from "next/link";
import { ArrowLeft, BookOpen, AlertCircle, ShieldAlert, Scale } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-16 px-4 sm:px-6 lg:px-8">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
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
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">
            Last Updated: May 26, 2026
          </p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <div className="p-6 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex items-start gap-4">
            <ShieldAlert className="h-6 w-6 text-amber-500 shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Important Notice on Usage Compliance</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Accounts violating these terms, engaging in fraudulent transaction modifications, or operating with invalid licensing may be suspended. Suspended accounts are locked from accessing local or synced platform functionalities.
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-500" />
              1. Acceptance of Terms
            </h2>
            <p>
              By installing the DumosRx client application or subscribing to our cloud backup database services, you agree to comply with and be bound by these Terms of Service. If you are entering into these terms on behalf of a store, clinic, or business entity, you warrant that you possess full administrative authority to bind the store profile.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="h-5 w-5 text-indigo-500" />
              2. Acceptable Use
            </h2>
            <p>
              You agree to use DumosRx only for lawful business administration, inventory control, and checkout operations. You are strictly prohibited from:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Tampering with system subscription checks or bypassing client-side license verification.</li>
              <li>Selling or tracking illegal, unregistered, or banned pharmaceutical compounds.</li>
              <li>Attempting to compromise the security, API endpoints, or database structures of the server.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-indigo-500" />
              3. Service Limitations & Liability
            </h2>
            <p>
              DumosRx provides business intelligence, automated low-stock metrics, and expiry warnings. However, the system is not a substitute for clinical pharmaceutical oversight. We do not assume responsibility or liability for medication dispensation errors, expired stock sales, or local hardware issues causing data loss. We recommend regular backups to protect database records.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              4. Modifications & Termination
            </h2>
            <p>
              We reserve the right to modify these terms or discontinue the platform services at any time. Accounts with suspended status will display the administrative suspension reason upon start and all local database modification operations will be blocked.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
