// On-demand injection. Nothing runs in a page until the user acts (a shortcut, a menu item, a pill click,
// a panel button) or the organisation approved the host. `files` are the IIFE bundles in dist/content/.
import { isChromePage } from "~/shared/sites";

export class NotScriptable extends Error { constructor(public reason: string, public diagnostic: string) { super(reason); } }

export async function inject(tabId: number, file: "pill" | "capture" | "insert" | "voicebar"): Promise<void> {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: [`content/${file}.js`] }); }
  catch (e) { throw new NotScriptable("cannot-script", `scripting.executeScript → ${String((e as Error)?.message ?? e)}`); }
}

/** Runs a self-contained function in the page and returns its result (readSelection / extractPage). */
export async function run<T>(tabId: number, func: () => T): Promise<T> {
  try { const [r] = await chrome.scripting.executeScript({ target: { tabId }, func }); return r?.result as T; }
  catch (e) { throw new NotScriptable("cannot-script", `scripting.executeScript → ${String((e as Error)?.message ?? e)}`); }
}

export function assertScriptable(tab: chrome.tabs.Tab | null | undefined): asserts tab is chrome.tabs.Tab & { id: number } {
  if (!tab?.id || isChromePage(tab.url ?? "")) throw new NotScriptable("chrome-page", `tabs.captureVisibleTab → Cannot access contents of url "${tab?.url ?? ""}"`);
}

export async function send<T = unknown>(tabId: number, msg: Record<string, unknown>): Promise<T | null> {
  try { return (await chrome.tabs.sendMessage(tabId, msg)) as T; } catch { return null; }
}
