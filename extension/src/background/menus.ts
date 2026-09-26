// Right-click menus (§E10). Chrome draws them; we supply the text. Hidden when signed out; "Send this page"
// only on approved sites. Two page items from one extension are grouped by Chrome under "Clearway Ops Agent ▸".
import { getSession, getSettings } from "~/shared/storage";
import { activeTab, tabInfo } from "./state";

export const MENU = { askSelection: "cw-ask-selection", sendPage: "cw-send-page", capture: "cw-capture", askImage: "cw-ask-image", aOpen: "cw-action-open", aCapture: "cw-action-capture", aSend: "cw-action-send", aSettings: "cw-action-settings" } as const;

export async function createMenus() {
  await chrome.contextMenus.removeAll();
  const mk = (p: chrome.contextMenus.CreateProperties) => chrome.contextMenus.create({ visible: true, ...p });
  mk({ id: MENU.askSelection, title: "Ask Clearway about “%s”", contexts: ["selection"] });
  mk({ id: MENU.sendPage, title: "Send this page", contexts: ["page"] });
  mk({ id: MENU.capture, title: "Capture region", contexts: ["page"] });
  mk({ id: MENU.askImage, title: "Ask Clearway about this image", contexts: ["image"] });
  mk({ id: MENU.aOpen, title: "Open side panel", contexts: ["action"] });
  mk({ id: MENU.aCapture, title: "Capture region", contexts: ["action"] });
  mk({ id: MENU.aSend, title: "Send this page", contexts: ["action"] });
  mk({ id: MENU.aSettings, title: "Settings", contexts: ["action"] });
  await updateMenus();
}

export async function updateMenus(tab?: chrome.tabs.Tab | null) {
  const session = await getSession();
  const signedIn = session.status === "signed-in";
  const t = tab ?? (await activeTab());
  const info = await tabInfo(t, session);
  const approved = signedIn && info.status === "approved";
  const upd = (id: string, p: chrome.contextMenus.UpdateProperties) => new Promise<void>((ok) => { try { chrome.contextMenus.update(id, p, () => { void chrome.runtime.lastError; ok(); }); } catch { ok(); } });
  await Promise.all([
    upd(MENU.askSelection, { visible: signedIn }), upd(MENU.capture, { visible: signedIn }), upd(MENU.askImage, { visible: signedIn }),
    upd(MENU.sendPage, { visible: approved }), upd(MENU.aSend, { visible: approved }), upd(MENU.aCapture, { visible: signedIn }),
  ]);
  void getSettings();
}
