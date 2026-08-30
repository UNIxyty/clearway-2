"use client";

// Shared plumbing for the dashboard regions (platform redesign Phase 3):
// a defensive polling hook (the service-checker / metrics endpoints may not
// be deployed yet — a 404 means "offline", never a crash), relative-time
// formatting, and the common card/header framing from the platform design.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import MaskIcon from "@/components/portal/Icon";
import { PCard } from "@/components/portal/ui";

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (urlRef.current !== requested) return;
      setData(json);
      setOffline(false);
      setError(null);
      setLoading(false);
    } catch (e) {
      if (urlRef.current !== requested) return;
      setError(e instanceof Error ? e.message : "Request failed");
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

export function clockTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function RegionCard({
  icon,
  title,
  subtitle,
  headerRight,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-cw-borderInner px-5 pb-[13px] pt-[15px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <MaskIcon name={icon} size={16} color="#6c7079" />
          <span className="text-[15px] font-bold text-cw-ink">{title}</span>
          {subtitle && <span className="hidden text-[12.5px] text-cw-faint sm:inline">{subtitle}</span>}
        </div>
        {headerRight && <div className="flex flex-none items-center gap-2">{headerRight}</div>}
      </div>
      {children}
    </PCard>
  );
}

export function RegionNote({
  icon,
  iconColor = "#9aa0a8",
  title,
  body,
  action,
}: {
  icon: string;
  iconColor?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-[9px] px-5 py-9 text-center">
      <MaskIcon name={icon} size={22} color={iconColor} />
      <div className="text-[14.5px] font-bold text-cw-ink">{title}</div>
      {body && <div className="max-w-[430px] text-[13.5px] leading-normal text-cw-muted">{body}</div>}
      {action}
    </div>
  );
}

export function LoadingRows({ count = 3, height = 44 }: { count?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-2 p-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-[10px] bg-[#f2f3f5]" style={{ height }} />
      ))}
    </div>
  );
}
