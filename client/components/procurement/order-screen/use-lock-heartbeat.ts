"use client";

import { useEffect, useRef } from "react";

export const LOCK_HEARTBEAT_MS = 3 * 60 * 1000;

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "input"] as const;

export function useLockHeartbeat({ active, beat }: { active: boolean; beat: () => Promise<unknown> }) {
  const beatRef = useRef(beat);
  const lastActivityRef = useRef(0);
  useEffect(() => {
    beatRef.current = beat;
  });

  useEffect(() => {
    if (!active) return;
    lastActivityRef.current = Date.now();
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, true));
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastActivityRef.current > LOCK_HEARTBEAT_MS) return;
      beatRef.current().catch((err) => console.error("Failed to refresh the order's editing lock", err));
    }, LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive, true));
    };
  }, [active]);
}
