// The panel's link to the worker: one port, reconnected when the worker restarts; storage for what must
// survive; a small event bus for one-off messages (draft, focus, notices, voice toggle).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, InsertState, PendingState, SessionState, Settings, TabInfo } from "~/shared/protocol";
import { DEFAULT_SETTINGS } from "~/shared/protocol";
import { getDraft, getSettings, setDraft as storeDraft, setSettings as storeSettings } from "~/shared/storage";

type Listener = (msg: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
let port: chrome.runtime.Port | null = null;
let connecting = false;

function connect() {
  if (port || connecting) return;
  connecting = true;
  try {
    const p = chrome.runtime.connect({ name: "sidepanel" });
    port = p; connecting = false;
    p.onMessage.addListener((m: Record<string, unknown>) => { for (const l of listeners) l(m); });
    p.onDisconnect.addListener(() => { port = null; setTimeout(connect, 400); });
    p.postMessage({ type: "panel.ready" });
  } catch { connecting = false; setTimeout(connect, 1000); }
}
export function post(msg: Record<string, unknown>) { if (!port) connect(); try { port?.postMessage(msg); } catch { port = null; connect(); } }
export function onMessage(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useExtension() {
  const [session, setSession] = useState<SessionState>({ status: "unknown", checkedAt: 0 });
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [pending, setPending] = useState<PendingState>({ confirmations: [], jobs: [], approvedSites: [], notamReview: 0 });
  const [insert, setInsert] = useState<InsertState | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [selectionHas, setSelectionHas] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [captureFailed, setCaptureFailed] = useState<{ reason: string; diagnostic: string; url: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const bus = useRef(new Set<Listener>());

  useEffect(() => {
    connect();
    void getSettings().then(setSettingsState);
    void getDraft().then((d) => { if (d) setDraftState(d); });
    const off = onMessage((m) => {
      const t = String(m.type);
      if (t === "session") setSession(m.session as SessionState);
      else if (t === "tab") { setTab(m.tab as TabInfo); setSelectionHas(false); }
      else if (t === "pending") setPending(m.pending as PendingState);
      else if (t === "insert") setInsert((m.insert as InsertState) ?? null);
      else if (t === "draft") { setDraftState(m.draft as Draft); setCapturing(false); }
      else if (t === "selection") setSelectionHas(Boolean(m.has));
      else if (t === "notice") setNotice(String(m.text));
      else if (t === "capturing") setCapturing(true);
      else if (t === "capture.failed") { setCapturing(false); setCaptureFailed({ reason: String(m.reason), diagnostic: String(m.diagnostic), url: String(m.url ?? "") }); }
      for (const l of bus.current) l(m);
    });
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "sync" && changes.settings) setSettingsState({ ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) });
      if (area === "local" && changes.pending) setPending(changes.pending.newValue as PendingState);
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => { off(); chrome.storage.onChanged.removeListener(onStorage); };
  }, []);

  const subscribe = useCallback((l: Listener) => { bus.current.add(l); return () => { bus.current.delete(l); }; }, []);
  const clearDraft = useCallback(async () => { setDraftState(null); await storeDraft(null); }, []);
  const setDraft = useCallback(async (d: Draft | null) => { setDraftState(d); await storeDraft(d); }, []);
  const setSettings = useCallback(async (patch: Partial<Settings>) => { setSettingsState((s) => ({ ...s, ...patch })); await storeSettings(patch); if ("pill" in patch) post({ type: "panel.action", action: "pill-setting", enabled: patch.pill }); }, []);
  const refreshSession = useCallback(() => post({ type: "session.refresh" }), []);

  return { session, tab, pending, insert, draft, setDraft, clearDraft, selectionHas, notice, setNotice, settings, setSettings, captureFailed, setCaptureFailed, capturing, subscribe, refreshSession, post };
}
export type Ext = ReturnType<typeof useExtension>;
