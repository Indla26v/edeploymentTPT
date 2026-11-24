"use client";

import * as React from "react";

/**
 * A per-browser UI preference (sidebar collapsed, table page size, remembered filters…) kept in localStorage,
 * with an in-memory fallback when storage is blocked. Never used for data that must persist or be shared.
 */
const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function useLocalSetting<T>(key: string, fallback: T): [T, (value: T) => void] {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(cb);
      listeners.set(key, set);
      const onStorage = (e: StorageEvent) => e.key === key && cb();
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const raw = React.useSyncExternalStore(subscribe, () => read(key), () => null);

  const value = React.useMemo<T>(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // fallback is intentionally not a dependency: it is a constant default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = React.useCallback(
    (v: T) => {
      const s = JSON.stringify(v);
      memory.set(key, s);
      try {
        window.localStorage.setItem(key, s);
      } catch {
        // storage blocked — in-memory value still works for this tab
      }
      listeners.get(key)?.forEach((l) => l());
    },
    [key],
  );
  return [value, setValue];
}
