// Stable per-browser device identity for display-settings profiles (Item 3).
// localStorage survives restarts on the wall appliance and on desktops; the
// cookie fallback covers storage-restricted contexts. The id itself carries
// no meaning — profiles/labels live server-side keyed by it.

const KEY = 'dw-device-id';

function randomId() {
  const rand = crypto?.randomUUID ? crypto.randomUUID().slice(0, 13) : Math.random().toString(36).slice(2, 12);
  return `dev-${rand.replace(/-/g, '')}`;
}

export function getDeviceId() {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    const match = document.cookie.match(/(?:^|;\s*)dw-device-id=([^;]+)/);
    if (match) return match[1];
    const id = randomId();
    document.cookie = `dw-device-id=${id}; max-age=31536000; path=/`;
    return id;
  }
}

/** Item 1 diagnostic: the actual rendering environment of this screen. */
export function collectViewportEnv() {
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || null;
  // Browser zoom is not directly readable; these two estimates cover the
  // common cases (desktop zoom changes outer/inner ratio and DPR).
  const zoomOuterRatio = window.outerWidth > 0 ? Math.round((window.outerWidth / window.innerWidth) * 100) / 100 : null;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? null,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    visualViewportScale: window.visualViewport?.scale ?? null,
    zoomOuterRatio,
    rootFontSize,
    userAgent: navigator.userAgent.slice(0, 160),
    collectedAt: new Date().toISOString(),
  };
}

/** Short human label a device self-reports before anyone renames it. */
export function defaultDeviceLabel(surface) {
  const env = collectViewportEnv();
  return `${surface} · ${env.innerWidth}×${env.innerHeight}@${env.devicePixelRatio}x`;
}
