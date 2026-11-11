"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Search,
  Sparkles,
  HelpCircle,
  Headphones,
  CheckCircle,
} from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/lib/guides-data";
import { GuideCard } from "@/components/guides/guide-card";

const CATEGORIES = [
  "All",
  "Point of Sale",
  "Inventory",
  "Multi-Store",
  "Device & Security",
] as const;

export default function GuidesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGuides = useMemo(() => {
    return GUIDES.filter((guide) => {
      const matchesCategory =
        selectedCategory === "All" || guide.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        guide.title.toLowerCase().includes(q) ||
        guide.summary.toLowerCase().includes(q) ||
        guide.steps.some((s) => s.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative ambient gradients */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto z-10 space-y-10">
        {/* Navigation & Controls */}
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-semibold text-primary hover:underline group"
          >
            <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/faq"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" /> FAQs
            </Link>
            <ModeToggle />
          </div>
        </header>

        {/* Hero Section */}
        <section className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Official DumosRx Knowledge Hub
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight font-serif text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-3">
            <BookOpen className="h-9 w-9 text-primary hidden sm:block" />
            Guides & Video Tutorials
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
            Step-by-step documentation, business best practices, and video walkthroughs
            to help you and your staff master DumosRx.
          </p>
        </section>

        {/* Search & Filter Bar */}
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search guides (e.g. spot sourcing, relink, transfer)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white dark:bg-slate-900 rounded-2xl border-slate-200 dark:border-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full text-xs font-medium ${
                  selectedCategory === cat
                    ? "shadow-sm"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Guides List */}
        <div className="space-y-8">
          {filteredGuides.length > 0 ? (
            filteredGuides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))
          ) : (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No guides found
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                We couldn't find any guide matching &ldquo;{searchQuery}&rdquo;. Try clearing your search or filtering by category.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
        </div>

        {/* Personalized Walkthrough Callout */}
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-2">
              <Headphones className="w-5 h-5 text-primary" />
              Need a 1-on-1 walkthrough for your store?
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Your dedicated DumosRx Account Manager can hop on a call to train your cashiers, configure your till permissions, or help you upload catalog spreadsheets.
            </p>
          </div>
          <Button asChild className="rounded-full shrink-0 shadow-md">
            <Link href="/support">Contact Support</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
