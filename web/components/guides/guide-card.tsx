"use client";

import { useState } from "react";
import {
  Play,
  Clock,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  Share2,
  Check,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GuideItem } from "@/lib/guides-data";

interface GuideCardProps {
  guide: GuideItem;
}

export function GuideCard({ guide }: GuideCardProps) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/guides#${guide.id}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <article
      id={guide.id}
      className="scroll-mt-28 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm transition-all hover:shadow-md space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-medium text-xs px-2.5 py-0.5">
            {guide.category}
          </Badge>
          {guide.badge && (
            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 font-semibold text-xs px-2.5 py-0.5">
              {guide.badge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {guide.readTime}
          </span>
          <span className="inline-flex items-center gap-1">
            <Video className="w-3.5 h-3.5" />
            {guide.videoDuration} video
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLink}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Copy link to this guide"
          >
            {copied ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="w-3 h-3" /> Copied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Share2 className="w-3 h-3" /> Share
              </span>
            )}
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-slate-900 dark:text-white tracking-tight">
          {guide.title}
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
          {guide.summary}
        </p>
      </div>

      {/* Video Tutorial Container */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video max-h-[360px] flex items-center justify-center group shadow-inner">
        {isPlaying ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-200 space-y-3">
            <Video className="w-12 h-12 text-primary animate-pulse" />
            <h4 className="font-semibold text-lg text-white">Interactive Video Player</h4>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md">
              {guide.videoPlaceholderText}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlaying(false)}
              className="mt-2 border-slate-700 hover:bg-slate-800"
            >
              Reset Preview
            </Button>
          </div>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center bg-linear-to-tr from-slate-950 via-slate-900 to-slate-950">
            {/* Background graphic elements */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0,transparent_70%)] pointer-events-none" />
            
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              className="relative z-10 w-16 h-16 rounded-full bg-primary/90 hover:bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 transition-transform transform group-hover:scale-110 active:scale-95"
              aria-label={`Play tutorial video for ${guide.title}`}
            >
              <Play className="w-7 h-7 fill-current ml-1" />
            </button>
            <p className="relative z-10 mt-4 text-xs sm:text-sm font-medium text-slate-300 max-w-md">
              {guide.videoPlaceholderText}
            </p>
            <span className="relative z-10 mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700">
              <Clock className="w-3 h-3" /> Duration: {guide.videoDuration}
            </span>
          </div>
        )}
      </div>

      {/* Step by step instructions */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-primary" /> Step-by-Step Instructions
        </h3>
        <ol className="space-y-2.5">
          {guide.steps.map((step, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 text-sm sm:text-base text-slate-700 dark:text-slate-200"
            >
              <span className="flex-none flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs mt-0.5">
                {idx + 1}
              </span>
              <span className="flex-1 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Pro Tip Box */}
      {guide.proTip && (
        <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 sm:p-5 flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-none mt-0.5" />
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
              Pro-Tip & Business Impact
            </span>
            <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              {guide.proTip}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
