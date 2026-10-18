"use client";

// What a phone page tells the shell: its title and subtitle in the 56 px app bar, where Back goes, up to two 44 px
// actions, which tab is lit, and whether the tab bar shows at all (deep screens — a sheet, a leg, an open document —
// hide it to make room for their action bar). A page sets this with usePhonePage; the shell draws it.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PhoneTab = "wall" | "flights" | "intake" | "agent" | "more";
export type PhoneAction = { icon: string; label: string; onClick?: () => void; href?: string; dot?: boolean };
export type PhoneChrome = {
  title: string;
  subtitle?: string | null;
  /** Codes in titles (callsigns, ICAO codes, NOTAM ids) are set in mono. */
  mono?: boolean;
  monoSubtitle?: boolean;
  back?: string | (() => void) | null;
  actions?: PhoneAction[];
  tab?: PhoneTab;
  tabs?: boolean;
};

type Ctx = { chrome: PhoneChrome; setChrome: (c: PhoneChrome) => void };
const ChromeContext = createContext<Ctx>({ chrome: { title: "" }, setChrome: () => {} });

export function PhoneChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<PhoneChrome>({ title: "" });
  return <ChromeContext.Provider value={{ chrome, setChrome }}>{children}</ChromeContext.Provider>;
}

export function usePhoneChrome() {
  return useContext(ChromeContext).chrome;
}

/** Declare the page's chrome. Re-declares when any field changes (titles follow the data: a callsign, a count). */
export function usePhonePage(c: PhoneChrome) {
  const { setChrome } = useContext(ChromeContext);
  const key = JSON.stringify({ ...c, back: typeof c.back === "function" ? "fn" : c.back, actions: (c.actions ?? []).map((a) => [a.icon, a.label, a.href ?? "", Boolean(a.dot)]) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setChrome(c); }, [key]);
}
