"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScraperCountryByIcao } from "@/lib/scraper-country-config";

const CAPTCHA_COUNTRIES = new Set(["greece", "netherlands", "lithuania"]);

function normalizeCountry(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isCaptchaProtectedCountry(country: string): boolean {
  return CAPTCHA_COUNTRIES.has(normalizeCountry(country));
}

export function getCaptchaCountryByIcao(icao: string): string | null {
  const cfg = getScraperCountryByIcao(icao);
  if (!cfg) return null;
  return isCaptchaProtectedCountry(cfg.country) ? cfg.country : null;
}

type ConsentDialogState = {
  open: boolean;
  country: string;
};

export function useCaptchaConsent() {
  const [dismissed, setDismissed] = useState(false);
  const [dialog, setDialog] = useState<ConsentDialogState>({ open: false, country: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/preferences", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setDismissed(Boolean(data?.preferences?.captcha_consent_dismissed));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const persistDismissed = useCallback(async () => {
    setDismissed(true);
    await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captcha_consent_dismissed: true }),
    }).catch(() => {});
  }, []);

  const closeAndResolve = useCallback((value: boolean) => {
    const resolver = resolveRef.current;
    resolveRef.current = null;
    setDialog({ open: false, country: "" });
    if (resolver) resolver(value);
  }, []);

  const requestConsentForCountry = useCallback(
    async (country: string): Promise<boolean> => {
      if (!isCaptchaProtectedCountry(country) || dismissed) return true;
      return await new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setDialog({ open: true, country });
      });
    },
    [dismissed],
  );

  const requestConsentForIcao = useCallback(
    async (icao: string): Promise<boolean> => {
      const country = getCaptchaCountryByIcao(icao);
      if (!country) return true;
      return requestConsentForCountry(country);
    },
    [requestConsentForCountry],
  );

  const actions = useMemo(
    () => ({
      continueNow: () => closeAndResolve(true),
      close: () => closeAndResolve(false),
      dontShowAgain: async () => {
        await persistDismissed();
        closeAndResolve(true);
      },
    }),
    [closeAndResolve, persistDismissed],
  );

  return {
    dismissed,
    dialog,
    requestConsentForCountry,
    requestConsentForIcao,
    ...actions,
  };
}
