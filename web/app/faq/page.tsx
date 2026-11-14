import Link from "next/link";
import { ArrowLeft, HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    category: "General",
    questions: [
      {
        q: "What is DumosRx?",
        a: "DumosRx is a comprehensive store management platform designed to streamline operations, manage inventory, and improve customer communication.",
      },
      {
        q: "How do I get started?",
        a: "You can sign up for a free trial directly on our website. Once registered, you can dive right into setting up your store profile and initial inventory.",
      },
    ],
  },
  {
    category: "POS & Inventory",
    questions: [
      {
        q: "How do I sell products sourced from neighboring stores or outside?",
        a: "At the Point of Sale, click 'Source outside' on a cart item whose quantity is more than you have in stock (or click an out-of-stock product). Enter what you paid the neighboring shop and select whether you paid from the Cash Drawer or on Owner Credit. The customer receives a receipt for your normal price, your profit margin is calculated instantly, and if cash was taken from the drawer, your Daily Close register balances automatically without manual notes.",
      },
      {
        q: "Can I sell items when physical stock arrives before paperwork is entered?",
        a: "Yes. In Settings > Register Configs, turn on 'Allow sales beyond recorded stock'. Cashiers can continue selling incoming items immediately. The system tracks the shortfall as owed stock and automatically settles it as soon as your supplier purchase order or delivery is received.",
      },
      {
        q: "How do I transfer stock between branches?",
        a: "If you operate multiple branches, staff with transfer permissions can move stock directly from the POS or under Inventory > Transfers. Select the supplying or destination branch and confirm the quantities to move.",
      },
      {
        q: "What should I do if a store till gets unlinked or disconnected?",
        a: "Store owners can generate a single-use 8-character Re-link Code from any logged-in device under Settings > Security > Sessions & Devices. Staff enters this code on the unlinked till to reconnect in seconds. If the owner is unreachable, your DumosRx account manager or support team can generate a secure re-link code on your behalf from the platform portal.",
      },
    ],
  },
  {
    category: "Accounts & Security",
    questions: [
      {
        q: "Is my data secure?",
        a: "Yes, we use industry-standard end-to-end encryption to protect all customer and store data.",
      },
      {
        q: "Can I add multiple staff members?",
        a: "Absolutely. Depending on your plan, you can invite multiple staff members and assign them specific roles and permissions within the platform.",
      },
    ],
  },
  {
    category: "Billing & Subscriptions",
    questions: [
      {
        q: "What payment methods do you accept?",
        a: "We accept all major credit cards, direct bank transfers, and standard healthcare purchasing networks.",
      },
      {
        q: "Can I cancel or change my plan anytime?",
        a: "Yes, you can upgrade, downgrade, or cancel your subscription at any time from your billing dashboard. Changes take effect at the start of your next billing cycle.",
      },
    ],
  },
];

export default function FAQPage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight font-serif text-slate-900 dark:text-white flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-primary" />
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-muted-foreground">
            Find answers to common questions about DumosRx, our features, and
            billing. Looking for step-by-step walkthroughs and video tutorials?
            Visit our{" "}
            <Link
              href="/guides"
              className="text-primary hover:underline font-medium"
            >
              Guides & Tutorials
            </Link>{" "}
            hub, or{" "}
            <Link
              href="/support"
              className="text-primary hover:underline font-medium"
            >
              contact our support team
            </Link>
            .
          </p>
        </div>

        <div className="space-y-8 mt-12">
          {faqs.map((category, index) => (
            <div key={index} className="space-y-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white border-b pb-2">
                {category.category}
              </h2>
              <Accordion
                type="single"
                collapsible
                className="w-full bg-white dark:bg-slate-900 rounded-2xl border px-6 shadow-sm"
              >
                {category.questions.map((faq, qIndex) => (
                  <AccordionItem key={qIndex} value={`item-${index}-${qIndex}`}>
                    <AccordionTrigger className="text-left font-semibold text-base py-4 hover:no-underline hover:text-primary transition-colors">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-slate-600 dark:text-slate-400 text-base leading-relaxed pb-6">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
