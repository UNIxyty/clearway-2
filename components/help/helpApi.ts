"use client";

// Client plumbing for the Help Centre: fetch helpers, the SSE subscription,
// the last-failed-request tracker, auto-context collection, and the offline
// outbox (replies saved on the device, resent with a dedupe clientKey).

import type { HelpBlock, HelpContext, HelpStreamEvent, HelpThread } from "@/lib/help/shared";

export type ThreadWithMeta = HelpThread & { preview: string; unread: number };

// ── Last failed request (auto-context field six) ────────────────────────────

let lastFailed: string | null = null;
let fetchPatched = false;

export function installFailedRequestTracker(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0].slice(0, 60);
    try {
      const res = await original(...args);
      if (res.status >= 500 && !path.startsWith("/api/help")) {
        const reqId = res.headers.get("x-request-id") || res.headers.get("x-vercel-id") || "";
        lastFailed = `${res.status} · ${path}${reqId ? ` · req ${reqId.slice(0, 8)}` : ""}`;
      }
      return res;
    } catch (error) {
      if (!path.startsWith("/api/help")) lastFailed = `network error · ${path}`;
      throw error;
    }
  };
}

function browserSummary(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : "unknown";
  const m =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${RegExp.$1}` : "unknown";
  return `${m} · ${os}`;
}

/** The four client-known context fields; the server adds role + services. */
export function collectClientContext(page?: string): Partial<HelpContext> {
  return {
    page: page || (typeof location !== "undefined" ? location.pathname : ""),
    browser: browserSummary(),
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    lastRequest: lastFailed || "none",
  };
}

// ── API calls ───────────────────────────────────────────────────────────────

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const helpApi = {
  listThreads: () => fetch("/api/help/threads", { cache: "no-store" }).then((r) => json<{ threads: ThreadWithMeta[] }>(r)),
  getThread: (ref: string) =>
    fetch(`/api/help/threads/${encodeURIComponent(ref)}`, { cache: "no-store" }).then((r) =>
      json<{
        thread: HelpThread; closed: boolean;
        messages: Array<{ id: string; author: "ops" | "developer"; authorName: string | null; blocks: HelpBlock[]; createdAt: string }>;
        events: Array<{ id: string; kind: string; payload: Record<string, unknown>; actor: string | null; createdAt: string }>;
        attachments: Array<{ id: string; name: string; size: number; mime: string; isImage: boolean }>;
        viewer: "ops" | "developer";
      }>(r),
    ),
  createThread: (body: Record<string, unknown>) =>
    fetch("/api/help/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => json<{ thread: HelpThread; telegramNotified: boolean }>(r)),
  sendMessage: (threadId: string, body: Record<string, unknown>) =>
    fetch(`/api/help/threads/${threadId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => json<{ message: { id: string; createdAt: string } }>(r)),
  markRead: (threadId: string) =>
    fetch(`/api/help/threads/${threadId}/read`, { method: "POST" }).catch(() => {}),
  presence: (threadId: string, action: string) =>
    fetch(`/api/help/threads/${threadId}/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      .then((r) => json<{ thread: HelpThread }>(r)),
  setStatus: (threadId: string, status: string, reason?: string) =>
    fetch(`/api/help/threads/${threadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }) })
      .then((r) => json<{ thread: HelpThread }>(r)),
  guideSearch: (q: string) =>
    fetch(`/api/help/guide-search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => json<{ results: Array<{ title: string; snippet: string; href: string }> }>(r)),
};

/** Upload with progress (XHR — fetch has no upload progress). */
export function uploadAttachment(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string; name: string; size: number; mime: string; isImage: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/help/attachments");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status === 201 && body.attachment) resolve(body.attachment);
        else {
          const err = new Error(body.error || `HTTP ${xhr.status}`) as Error & { status?: number; body?: unknown };
          err.status = xhr.status;
          err.body = body;
          reject(err);
        }
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

// ── SSE ─────────────────────────────────────────────────────────────────────

export function subscribeHelpStream(onEvent: (e: HelpStreamEvent) => void): () => void {
  const es = new EventSource("/api/help/stream");
  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as (HelpStreamEvent & { type: string }) | { type: "hello" };
      if (data.type !== "hello") onEvent(data as HelpStreamEvent);
    } catch { /* ignore malformed frames */ }
  };
  return () => es.close();
}

// ── Offline outbox: the reply is saved on this device, sends itself ─────────

export type OutboxItem = {
  clientKey: string;
  threadId: string;
  blocks: HelpBlock[];
  attachmentIds: string[];
  queuedAt: string;
  lastTriedAt?: string;
  lastError?: string;
};

const OUTBOX_KEY = "help-outbox";

export function readOutbox(): OutboxItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function writeOutbox(items: OutboxItem[]): void {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(0, 50))); } catch { /* full */ }
}

export async function flushOutbox(threadId?: string): Promise<{ sent: number; failed: number }> {
  const items = readOutbox().filter((i) => !threadId || i.threadId === threadId);
  let sent = 0, failed = 0;
  for (const item of items) {
    try {
      await helpApi.sendMessage(item.threadId, {
        blocks: item.blocks,
        attachmentIds: item.attachmentIds,
        clientKey: item.clientKey,
      });
      writeOutbox(readOutbox().filter((i) => i.clientKey !== item.clientKey));
      sent++;
    } catch (error) {
      const out = readOutbox();
      const found = out.find((i) => i.clientKey === item.clientKey);
      if (found) {
        found.lastTriedAt = new Date().toISOString();
        found.lastError = error instanceof Error ? error.message : "failed";
        // A 4xx means the server refused it — keep it visible as not-delivered,
        // do not silently retry forever.
        writeOutbox(out);
      }
      failed++;
    }
  }
  return { sent, failed };
}

export const utcTime = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
};

export function ageOf(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = new Date(iso);
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  return `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]}`;
}

/** The developer's stated reading window (06:00–22:00Z). */
export function developerAvailableNow(): boolean {
  const h = new Date().getUTCHours();
  return h >= 6 && h < 22;
}

export const DEVELOPER_NAME = "Mārtiņš";
export const OUT_OF_HOURS_PHONE = "+371 2 000 000";
