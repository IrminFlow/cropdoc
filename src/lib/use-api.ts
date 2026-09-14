"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./client";

/** Loads JSON from an API route on mount and whenever the URL changes. */
export function useApi<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>(
    { url },
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api<T>(url).then(
      (data) => active && setState({ url, data }),
      (error: Error) => active && setState({ url, error: error.message }),
    );
    return () => {
      active = false;
    };
  }, [url, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // Never show data that belongs to a previous URL.
  const current = state.url === url ? state : { url };
  return {
    data: current.data ?? null,
    error: current.error ?? "",
    reload,
  };
}
