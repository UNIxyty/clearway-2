"use client";

// Whether motion is reduced on this page: the portal's Motion preference (data-motion="reduce" on <html>, one stored
// choice — docs/portal-tokens.md) or, when that is "Match device", the device setting.
import { useEffect, useState } from "react";

export function useThemeMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const read = () => setReduced(document.documentElement.getAttribute("data-motion") === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
    read();
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", read);
    const mo = new MutationObserver(read); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq?.removeEventListener?.("change", read); mo.disconnect(); };
  }, []);
  return reduced;
}
