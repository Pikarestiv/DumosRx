"use client";

import { useState, useEffect } from "react";

export function LiveClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    // Stays null until mount so the server-rendered and first client render
    // match; `new Date()` would otherwise differ between the two.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
