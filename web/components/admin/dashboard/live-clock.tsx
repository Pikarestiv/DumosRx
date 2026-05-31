"use client";

import { useState, useEffect } from "react";

export function LiveClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!currentTime) return null;

  return (
    <span>{currentTime.toLocaleTimeString()}</span>
  );
}
