"use client";

import { useEffect, useState } from "react";

/** Ticks once a second while `active`, so a component showing "elapsed
 * time" re-renders live instead of freezing at whatever it was on mount.
 * Callers just recompute `Date.now() - startedAt` on every render. */
export function useTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
