"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch a dashboard API endpoint, automatically appending the current global
 * filter query string. Re-fetches whenever the filters change.
 */
export function useApiData<T>(path: string, extraQuery?: Record<string, string | number | undefined>): ApiState<T> {
  const searchParams = useSearchParams();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const qs = searchParams.toString();
  const extra = extraQuery
    ? Object.entries(extraQuery)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = [qs, extra].filter(Boolean).join("&");
    const url = query ? `${path}?${query}` : path;
    fetch(url, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `خطأ ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json as T);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, qs, extra, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** POST helper for actions (login, backfill, sync, settings). */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `خطأ ${res.status}`);
  return json as T;
}
