"use client";

import Link from "next/link";
import { Play, Clock, ArrowRight, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GuideItem } from "@/lib/guides-data";

interface GuideListCardProps {
  guide: GuideItem;
}

export function GuideListCard({ guide }: GuideListCardProps) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between overflow-hidden"
    >
      <div>
        {/* Video Thumbnail Preview */}
        <div className="relative aspect-video w-full bg-linear-to-tr from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12)_0,transparent_70%)] pointer-events-none" />
          
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25 transition-transform transform group-hover:scale-110">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-300 border border-slate-800">
            <Video className="w-3 h-3 text-primary" />
            <span>{guide.videoDuration}</span>
          </div>

          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900/90 text-slate-300 backdrop-blur-sm px-2 py-0.5 rounded-full border border-slate-700">
              {guide.category}
            </span>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            {guide.badge && (
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 font-semibold text-[11px] px-2 py-0.5">
                {guide.badge}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> {guide.readTime}
            </span>
          </div>

          <h3 className="text-lg font-bold font-serif text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2">
            {guide.title}
          </h3>

          <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 leading-relaxed">
            {guide.summary}
          </p>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs font-semibold text-primary">
        <span>Watch Video & Read Guide</span>
        <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}

