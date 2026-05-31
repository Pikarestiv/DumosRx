"use client";

import { useState, useEffect } from "react";

export function LiveClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!currentTime) return null;

  return (
    <span className="text-sm text-muted-foreground hidden md:inline-flex bg-accent/10 px-3 py-1 rounded-full items-center font-mono">
      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}
