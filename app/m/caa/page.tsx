"use client";

// CAA details on a phone (Tier 2 › list with a call button): call an authority. Rows by country with the first phone
// as a 44 px call button; the detail lists every phone and email as a tap target, with what the authority is for.
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { T2Detail, T2Groups, T2Page, T2Search, TONE } from "@/components/m/tier2";
import { matches, useResource, wallUrl } from "@/lib/m/t2";

type Caa = { id: string; country: string; authorityName?: string; validity?: string; functionText?: string; functionKind?: string; info?: string; contact?: string; phones?: string[]; mail?: string[]; sita?: string; aftn?: string; isActive?: boolean; matchedFlightCount?: number };
const KIND: Record<string, string> = { overflight_landing: "Overflight and landing permits", landing: "Landing permits", overflight: "Overflight permits", flight_plan: "Flight plans", other: "Other" };

export default function CaaPhonePage() {
  const search = useSearchParams(); const router = useRouter();
  const openId = search.get("id");
  const r = useResource<{ entries?: Caa[] }>(wallUrl("/caa?withMatches=true"), { fallback: "The wall did not answer." });
  const [q, setQ] = useState("");
  const items = useMemo(() => (r.data?.entries ?? []).filter((c) => c.isActive !== false).sort((a, b) => a.country.localeCompare(b.country)), [r.data]);
  const picked = openId ? items.find((c) => c.id === openId) : null;
  usePhonePage({ title: picked ? picked.country : "CAA details", subtitle: picked ? picked.authorityName ?? null : items.length ? `${items.length} authorities` : null, back: picked ? () => router.replace("/m/caa") : null, tab: "more", tabs: !picked });
  const shown = items.filter((c) => matches(q, c.country, c.authorityName, c.functionText));
  const tel = (p: string) => `tel:${p.replace(/[^+\d]/g, "")}`;

  if (picked) return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <T2Detail title={picked.authorityName || picked.country} rows={[{ k: "For", v: KIND[picked.functionKind ?? ""] ?? picked.functionText ?? "—" }, ...(picked.functionText && KIND[picked.functionKind ?? ""] ? [{ k: "Detail", v: picked.functionText }] : []), { k: "Hours", v: picked.validity || "—" }, ...(picked.info ? [{ k: "Notes", v: <span className="whitespace-pre-wrap">{picked.info}</span> }] : []), ...(picked.sita ? [{ k: "SITA", v: picked.sita, mono: true }] : []), ...(picked.aftn ? [{ k: "AFTN", v: picked.aftn, mono: true }] : []), { k: "Flights today", v: String(picked.matchedFlightCount ?? 0), mono: true }]}>
        {((picked.phones?.length ?? 0) > 0 || (picked.mail?.length ?? 0) > 0) && (
          <div className="overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface">
            {(picked.phones ?? []).map((p) => <a key={p} href={tel(p)} className="flex min-h-14 items-center gap-3 border-t border-cw-divider px-3.5 text-cw-text first:border-t-0"><span className="flex h-11 w-11 items-center justify-center rounded-[11px]" style={{ background: TONE.ok.bg, color: TONE.ok.fg }}><MaskIcon name="phone" size={18} color="currentColor" /></span><span className="flex min-w-0 flex-1 flex-col"><span className="font-mono text-[15px] font-semibold">{p}</span><span className="text-[12.5px] text-cw-text-muted">Call</span></span></a>)}
            {(picked.mail ?? []).map((m) => <a key={m} href={`mailto:${m}`} className="flex min-h-14 items-center gap-3 border-t border-cw-divider px-3.5 text-cw-text first:border-t-0"><span className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-cw-primary-tint text-cw-text-link"><MaskIcon name="mail" size={18} color="currentColor" /></span><span className="flex min-w-0 flex-1 flex-col"><span className="break-all font-mono text-[14px] font-semibold">{m}</span><span className="text-[12.5px] text-cw-text-muted">Email</span></span></a>)}
          </div>
        )}
        {picked.contact && <span className="px-0.5 text-[13.5px] leading-normal text-cw-text-body">{picked.contact}</span>}
      </T2Detail>
    </div>
  );
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} stale={Boolean(r.data)} empty={items.length === 0} emptyCopy={["No authorities yet", "CAA contacts are added on a wider screen."]} errorCopy={["Couldn’t load contacts", "Try again in a moment."]} onRetry={r.reload}
      top={<T2Search value={q} onChange={setQ} placeholder="Country or authority" />}>
      {shown.length === 0 ? <span className="px-0.5 py-6 text-center text-[14.5px] text-cw-text-muted">No match. Try the country’s name in English.</span>
        : <T2Groups groups={[{ h: "COUNTRIES", rows: shown.map((c) => ({ key: c.id, title: `${c.country}${c.authorityName ? ` · ${c.authorityName}` : ""}`, sub: [c.validity, c.phones?.[0]].filter(Boolean).join(" · ") || KIND[c.functionKind ?? ""] || c.functionText, call: c.phones?.[0], href: `/m/caa?id=${encodeURIComponent(c.id)}` })) }]} />}
    </T2Page>
  );
}
