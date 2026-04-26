import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const ENTRY_URL = "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html";
const UA = "Mozilla/5.0 (compatible; clearway-lithuania-hitl-auto/1.0)";
const SESSION_TTL_MS = 20 * 60 * 1000;

type Box = { x: number; y: number; width: number; height: number };

export type LithuaniaSession = {
  id: string;
  browser: any;
  context: any;
  page: any;
  createdAt: number;
  lastUsedAt: number;
};

type SessionStore = Map<string, LithuaniaSession>;

function getStore(): SessionStore {
  const g = globalThis as unknown as { __lithuaniaHitlStore?: SessionStore };
  if (!g.__lithuaniaHitlStore) g.__lithuaniaHitlStore = new Map();
  return g.__lithuaniaHitlStore;
}

async function importPlaywright(): Promise<any> {
  return await import("playwright");
}

function resolveChromiumExecutablePath(): string | undefined {
  const envPath = String(process.env.PLAYWRIGHT_CHROMIUM_PATH || "").trim();
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = ["/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/lib/chromium/chrome"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function touch(session: LithuaniaSession) {
  session.lastUsedAt = Date.now();
}

export async function closeSession(sessionId: string): Promise<boolean> {
  const store = getStore();
  const session = store.get(sessionId);
  if (!session) return false;
  store.delete(sessionId);
  await session.context?.close?.().catch(() => {});
  await session.browser?.close?.().catch(() => {});
  return true;
}

export async function cleanupStaleSessions(): Promise<void> {
  const store = getStore();
  const now = Date.now();
  for (const [id, session] of store.entries()) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      await closeSession(id);
    }
  }
}

export async function createSession(): Promise<LithuaniaSession> {
  await cleanupStaleSessions();
  const playwright = await importPlaywright();
  const executablePath = resolveChromiumExecutablePath();
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: UA,
  });
  const page = await context.newPage();
  await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const session: LithuaniaSession = {
    id: randomUUID(),
    browser,
    context,
    page,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  getStore().set(session.id, session);
  return session;
}

export function getSession(sessionId: string): LithuaniaSession | null {
  const session = getStore().get(sessionId) ?? null;
  if (session) touch(session);
  return session;
}

export async function getChallengeInfo(page: any): Promise<{
  url: string;
  title: string;
  challengeDetected: boolean;
  challengeOnly: boolean;
  challengeBox: Box | null;
  recommendedPopup: { width: number; height: number } | null;
}> {
  const url = String(page.url?.() || "");
  const title = String((await page.title().catch(() => "")) || "");
  const challengeDetected = await page
    .evaluate(() => {
      const t = String(document.title || "").toLowerCase();
      const bodyText = String(document.body?.innerText || "").toLowerCase();
      const hasCfIframe = Boolean(document.querySelector("iframe[src*='challenges.cloudflare.com']"));
      return (
        hasCfIframe ||
        t.includes("just a moment") ||
        bodyText.includes("just a moment") ||
        bodyText.includes("verify you are human") ||
        bodyText.includes("checking your browser")
      );
    })
    .catch(() => false);

  let challengeBox: Box | null = null;
  const selectors = [
    "iframe[src*='challenges.cloudflare.com']",
    ".cf-turnstile",
    "#challenge-stage",
    "#cf-content",
    "form#challenge-form",
  ];
  for (const sel of selectors) {
    const box = await page
      .locator(sel)
      .first()
      .boundingBox()
      .catch(() => null);
    if (box && box.width > 40 && box.height > 20) {
      challengeBox = {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
      break;
    }
  }

  const challengeOnly =
    challengeDetected &&
    (await page
      .evaluate(() => {
        const text = String(document.body?.innerText || "").trim();
        const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        return lines.length <= 12;
      })
      .catch(() => false));

  const recommendedPopup =
    challengeOnly && challengeBox
      ? {
          width: Math.max(420, Math.min(900, challengeBox.width + 140)),
          height: Math.max(320, Math.min(860, challengeBox.height + 220)),
        }
      : null;

  return { url, title, challengeDetected, challengeOnly, challengeBox, recommendedPopup };
}

export async function makeSnapshot(session: LithuaniaSession): Promise<{
  imageBase64: string;
  imageMime: string;
  viewport: { width: number; height: number };
  url: string;
  title: string;
  challengeDetected: boolean;
  challengeOnly: boolean;
  challengeBox: Box | null;
  recommendedPopup: { width: number; height: number } | null;
  snapshotError?: string;
}> {
  touch(session);
  if (!session.page || session.page.isClosed?.()) {
    session.page = await session.context.newPage();
    await session.page.goto(ENTRY_URL, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
  }
  const page = session.page;
  const challenge = await getChallengeInfo(page).catch(() => ({
    url: String(page?.url?.() || ""),
    title: "",
    challengeDetected: false,
    challengeOnly: false,
    challengeBox: null,
    recommendedPopup: null,
  }));
  const screenshotWithTimeout = async () =>
    await Promise.race([
      page.screenshot({ type: "jpeg", quality: 65, fullPage: false }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Screenshot timeout")), 5_000)),
    ]);

  let jpeg: Buffer | null = null;
  let snapshotError = "";
  try {
    jpeg = Buffer.from(await screenshotWithTimeout());
  } catch (err1) {
    snapshotError = err1 instanceof Error ? err1.message : String(err1);
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 12_000 });
      jpeg = Buffer.from(await screenshotWithTimeout());
      snapshotError = "";
    } catch (err2) {
      snapshotError = err2 instanceof Error ? err2.message : String(err2);
    }
  }

  // 1x1 transparent GIF fallback to keep popup responsive.
  const fallbackGif = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const vp = page.viewportSize?.() || { width: 1280, height: 900 };
  return {
    imageBase64: jpeg ? Buffer.from(jpeg).toString("base64") : fallbackGif,
    imageMime: jpeg ? "jpeg" : "gif",
    viewport: { width: vp.width, height: vp.height },
    ...challenge,
    ...(snapshotError ? { snapshotError } : {}),
  };
}

