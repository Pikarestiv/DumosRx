"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Video,
  Play,
  BookOpen,
  Lightbulb,
  Share2,
  Check,
  Headphones,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import type { GuideItem } from "@/lib/guides-data";
import { GuideListCard } from "@/components/guides/guide-list-card";

interface GuideDetailViewProps {
  guide: GuideItem;
  relatedGuides: GuideItem[];
}

export function GuideDetailView({ guide, relatedGuides }: GuideDetailViewProps) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      {/* Background gradients */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto z-10 space-y-10">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between">
          <Link
            href="/guides"
            className="inline-flex items-center text-sm font-semibold text-primary hover:underline group"
          >
            <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
            Back to all guides
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="rounded-full text-xs font-medium bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            >
              {copied ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Copied Link
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> Share Guide
                </span>
              )}
            </Button>
            <ModeToggle />
          </div>
        </header>

        {/* Hero Section */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-medium text-xs px-2.5 py-0.5">
              {guide.category}
            </Badge>
            {guide.badge && (
              <Badge className="bg-primary/10 text-primary border-primary/20 font-semibold text-xs px-2.5 py-0.5">
                {guide.badge}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 ml-2">
              <Clock className="w-3.5 h-3.5" /> {guide.readTime}
            </span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Video className="w-3.5 h-3.5" /> {guide.videoDuration} video
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight font-serif text-slate-900 dark:text-white leading-tight">
            {guide.title}
          </h1>

          <p className="text-base sm:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
            {guide.summary}
          </p>
        </section>

        {/* Video Tutorial Container */}
        <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video max-h-[460px] flex items-center justify-center group shadow-xl">
          {isPlaying ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-200 space-y-4">
              <Video className="w-14 h-14 text-primary animate-pulse" />
              <h4 className="font-semibold text-xl text-white">Interactive Video Tutorial</h4>
              <p className="text-sm text-slate-400 max-w-lg">
                {guide.videoPlaceholderText}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPlaying(false)}
                className="mt-2 border-slate-700 hover:bg-slate-800 text-xs"
              >
                Reset Video Preview
              </Button>
            </div>
          ) : (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-8 text-center bg-linear-to-tr from-slate-950 via-slate-900 to-slate-950">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12)_0,transparent_70%)] pointer-events-none" />
              
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                className="relative z-10 w-20 h-20 rounded-full bg-primary hover:bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/30 transition-transform transform group-hover:scale-110 active:scale-95"
                aria-label={`Play tutorial video for ${guide.title}`}
              >
                <Play className="w-8 h-8 fill-current ml-1" />
              </button>
              <p className="relative z-10 mt-5 text-sm sm:text-base font-semibold text-slate-200 max-w-md">
                {guide.videoPlaceholderText}
              </p>
              <span className="relative z-10 mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                <Clock className="w-3.5 h-3.5 text-primary" /> Video duration: {guide.videoDuration}
              </span>
            </div>
          )}
        </div>

        {/* Step-by-Step Instructions */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b pb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-serif text-slate-900 dark:text-white">
              Step-by-Step Instructions
            </h2>
          </div>

          <ol className="space-y-4">
            {guide.steps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-4 text-base sm:text-lg text-slate-700 dark:text-slate-200"
              >
                <span className="flex-none flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm mt-0.5">
                  {idx + 1}
                </span>
                <span className="flex-1 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Pro Tip Box */}
        {guide.proTip && (
          <section className="rounded-3xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-6 sm:p-8 flex items-start gap-4">
            <Lightbulb className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-none mt-1" />
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Pro-Tip & Business Impact
              </h3>
              <p className="text-sm sm:text-base text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                {guide.proTip}
              </p>
            </div>
          </section>
        )}

        {/* Related Guides */}
        {relatedGuides.length > 0 && (
          <section className="space-y-6 pt-4">
            <h2 className="text-2xl font-bold font-serif text-slate-900 dark:text-white">
              More Guides & Tutorials
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedGuides.map((rel) => (
                <GuideListCard key={rel.id} guide={rel} />
              ))}
            </div>
          </section>
        )}

        {/* Personalized Walkthrough Callout */}
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-2">
              <Headphones className="w-5 h-5 text-primary" />
              Need a personal walkthrough for your store?
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Your dedicated DumosRx Account Manager can walk you and your staff through turning these features on, configuring permissions, and running live test transactions.
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

