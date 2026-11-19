"use client";

import { useEffect, useRef } from "react";

interface Options {
  holder: string | null | undefined;
  thisDevice: string;
  idle: boolean;
  reload: () => Promise<unknown>;
}

export function useReloadOnLockHandover({ holder, thisDevice, idle, reload }: Options) {
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (holder === undefined) return;
    const before = previous.current;
    previous.current = holder;
    if (before === undefined || before === holder) return;
    const involvesAnotherTill = (!!before && before !== thisDevice) || (!!holder && holder !== thisDevice);
    if (involvesAnotherTill && idle) void reload();
  }, [holder, thisDevice, idle, reload]);
}
