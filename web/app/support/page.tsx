import Link from "next/link";
import {
  ArrowLeft,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";

export default function SupportPage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight font-serif text-slate-900 dark:text-white flex items-center gap-3">
            <Headphones className="h-8 w-8 text-primary" />
            Help & Support
          </h1>
          <p className="text-lg text-muted-foreground">
            We're here to help you get the most out of DumosRx. How can we
            assist you today?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex flex-col items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Email Support
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-4">
                Send us an email anytime. We typically respond within 24 hours.
              </p>
              <a
                href="mailto:support@dumosrx.com"
                className="font-semibold text-primary hover:underline"
              >
                support@dumosrx.com
              </a>
            </div>
          </div>

          <div className="p-6 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex flex-col items-start gap-4">
            <div className="p-3 bg-accent/10 rounded-lg text-accent">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Phone Support
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-4">
                Available Monday to Friday, 9am - 5pm. Priority for Pro and
                Enterprise plans.
              </p>
              <a
                href="tel:+1234567890"
                className="font-semibold text-accent hover:underline"
              >
                +234 (814) 123-0877
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 p-8 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Send us a message
            </h2>
          </div>

          <form className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  className="w-full px-4 py-2 border rounded-lg bg-transparent focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  className="w-full px-4 py-2 border rounded-lg bg-transparent focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="you@store.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium">
                Subject
              </label>
              <input
                type="text"
                id="subject"
                className="w-full px-4 py-2 border rounded-lg bg-transparent focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                placeholder="How can we help?"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium">
                Message
              </label>
              <textarea
                id="message"
                rows={5}
                className="w-full px-4 py-2 border rounded-lg bg-transparent focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
                placeholder="Describe your issue or question..."
              ></textarea>
            </div>
            <button
              type="button"
              className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
