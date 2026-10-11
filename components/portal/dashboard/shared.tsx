"use client";

// Shared plumbing for the dashboard blocks: a defensive polling hook (the service-checker / metrics endpoints may not
// be deployed yet — a 404 means "offline", never a crash) and time / size formatting.
import { useCallback, useEffect, useRef, useState } from "react";
import { errorDetail } from "@/components/kit";

export type PollState<T> = {
  data: T | null;
  loading: boolean;
  /** Endpoint answered 404/501/503 — the producing service isn't deployed. */
  offline: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function usePoll<T>(url: string, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);

  const load = useCallback(async () => {
    const requested = url;
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      if (urlRef.current !== requested) return; // stale (filter switched)
      if (res.status === 404 || res.status === 501 || res.status === 503) {
        setOffline(true);
        setError(null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(errorDetail(res.status, "GET", url.split("?")[0]));
        setLoading(false);
        return;
      }
      const json = (await res.json()) as T;
      if (urlRef.current !== requested) return;
      setData(json);
      setOffline(false);
      setError(null);
      setLoading(false);
    } catch (e) {
      if (urlRef.current !== requested) return;
      setError(errorDetail(e instanceof Error && e.name === "SyntaxError" ? "bad JSON" : "network", "GET", url.split("?")[0]));
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    urlRef.current = url;
    setLoading(true);
    load();
    const timer = setInterval(load, intervalMs);
    return () => clearInterval(timer);
  }, [load, intervalMs, url]);

  return { data, loading, offline, error, refresh: load };
}

export function timeAgo(isoString: string): string {
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 45_000) return "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
