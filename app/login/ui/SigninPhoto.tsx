"use client";

// The sign-in photograph (Sign In v2, 2026-10-28). The form comes first: the server sends no <img> at all, so the
// photograph cannot compete with the form for the network or block a paint. After the page's own load event and an idle
// moment, and only when the window is at least 900 px wide, the panel gets a <picture> — AVIF, WebP for browsers without
// AVIF, three widths (480 / 720 / 1024; the browser takes the one the panel needs) — and fades it in once it has decoded.
// Below 900 px the panel is not drawn and nothing is downloaded; widening the window past 900 px later loads it then.
//
// Which photograph (all three from the design): between 20:00 and 06:00 at the base (Riga) it is the runway at night,
// in either theme; by day it follows the theme — blue dawn in light, blue night in dark. A theme switch on the page
// re-chooses. The files are public/signin/<name>-<width>.<avif|webp>, made from the design's 2 MB PNGs.
import { useEffect, useRef, useState } from "react";

export type SigninPhotoName = "blue-dawn" | "blue-night" | "runway-night";
const WIDTHS = [480, 720, 1024] as const;
export const PANEL_MIN_WIDTH = 900;
const BASE_TZ = "Europe/Riga";

export function choosePhoto(theme: string | null, now: Date = new Date()): SigninPhotoName {
  let hour = now.getUTCHours();
  try { hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: BASE_TZ, hour: "2-digit", hourCycle: "h23" }).format(now)); } catch { /* UTC hour */ }
  if (hour >= 20 || hour < 6) return "runway-night";
  return theme === "dark" ? "blue-night" : "blue-dawn";
}

const set = (name: SigninPhotoName, ext: "avif" | "webp") => WIDTHS.map((w) => `/signin/${name}-${w}.${ext} ${w}w`).join(", ");
// The panel is 460 px wide from 900 px (448 px of photograph inside its margin) and 680 px from 1200 px (668 px).
const SIZES = "(min-width: 1200px) 668px, 448px";

export default function SigninPhoto() {
  const [photo, setPhoto] = useState<SigninPhotoName | null>(null);
  const [shown, setShown] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const wide = window.matchMedia(`(min-width: ${PANEL_MIN_WIDTH}px)`);
    const pick = () => { if (!cancelled && wide.matches) setPhoto(choosePhoto(document.documentElement.getAttribute("data-theme"))); };
    const later = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(pick, { timeout: 1500 }); else window.setTimeout(pick, 200);
    };
    // after the page's own load: the form's scripts, styles and fonts never wait behind the photograph
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
    const onWide = () => { if (wide.matches) later(); };
    wide.addEventListener("change", onWide);
    // the theme changed on this page (the sun/moon menu): choose again
    const mo = new MutationObserver(() => setPhoto((p) => (p ? choosePhoto(document.documentElement.getAttribute("data-theme")) : p)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { cancelled = true; window.removeEventListener("load", later); wide.removeEventListener("change", onWide); mo.disconnect(); };
  }, []);

  useEffect(() => {
    setShown(false);
    // an image the browser already had can be complete before React attaches onLoad
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setShown(true);
  }, [photo]);

  return (
    <div data-signin-photo={photo ?? ""} style={{ position: "absolute", inset: 0 }}>
      {photo && (
        <picture>
          <source type="image/avif" srcSet={set(photo, "avif")} sizes={SIZES} />
          <img
            ref={imgRef}
            key={photo}
            src={`/signin/${photo}-720.webp`}
            srcSet={set(photo, "webp")}
            sizes={SIZES}
            alt=""
            decoding="async"
            fetchPriority="low"
            onLoad={() => setShown(true)}
            className="si-photo"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: shown ? 1 : 0 }}
          />
        </picture>
      )}
    </div>
  );
}
