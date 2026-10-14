"use client";

// Admin → Maintenance (portal redesign, stage 3 — "Page Maintenance"). Shows the state first; says what turning the
// portal off does before the button; asks for OFF to be typed before it happens (approved item 20). When the portal
// is off, the whole card turns red. The controls stay locked until the state has loaded. What it says it does is what
// middleware.ts does: everyone but Admins and Developers gets the maintenance page from their next page load; Admins
// and Developers are brought here; sign-in, the API, the Ops agent and the wall keep running.
import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { dayTimeZ } from "@/lib/time";
import { Button, Callout, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Skeleton, TextArea, TextInput, errorDetail, useToast } from "@/components/kit";
import { OFFLINE } from "@/lib/error-text";

type State = {
  enabled: boolean; message: string | null; eta_text: string | null; updated_at: string | null;
  since: string | null; by: string | null; lastEnded: { at: string; by: string | null } | null;
  can: { enable: boolean; disable: boolean; clearCache: boolean };
};
const zulu = (iso: string) => dayTimeZ(iso, { alwaysDate: true });
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`; };

const EFFECTS = [
  { icon: "log-out", tone: "var(--cw-danger)", text: "Everyone except Admins and Developers gets the maintenance page from their next page load, on every route. A page they already have open keeps working until they move or reload." },
  { icon: "user-x", tone: "var(--cw-danger)", text: "They can still sign in, but are taken straight to the maintenance page." },
  { icon: "shield-check", tone: "var(--cw-success)", text: "Admins and Developers are brought to this page whenever they open the portal, so one of you can turn it back on." },
  { icon: "activity", tone: "var(--cw-text-muted)", text: "The Ops agent, the wall and the portal's API keep running." },
];

export default function MaintenancePage() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState("");
  const [eta, setEta] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/admin/maintenance", { cache: "no-store" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 403) { setForbidden(true); return; }
    if (!res || !res.ok) { setLoadError(errorDetail(res?.status ?? "network", "GET", "/api/admin/maintenance")); return; }
    setState({ can: { enable: false, disable: false, clearCache: false }, ...body });
    // While live, the fields are for the next maintenance: they start empty (the last row's text belonged to the last switch).
    setMessage(body.enabled ? body.message ?? "" : ""); setEta(body.enabled ? body.eta_text ?? "" : "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, message: message || null, eta_text: eta || null }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.show({ tone: "danger", title: enabled ? "The portal was not turned off" : "The portal was not turned back on", body: body?.error || `The server said ${res.status}.` }); return; }
      setConfirmOff(false); setTyped("");
      toast.show({ tone: enabled ? "warning" : "success", title: enabled ? "The portal is off for everyone" : "The portal is live again", body: enabled ? "People get the maintenance page from their next page load." : "Everyone can use it from their next page load." });
      await load();
    } catch {
      toast.show({ tone: "danger", title: enabled ? "The portal was not turned off" : "The portal was not turned back on", body: OFFLINE });
    } finally { setSaving(false); }
  }

  async function clearCache() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/aip/clear-cache", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      setClearOpen(false);
      if (!res.ok) { toast.show({ tone: "danger", title: "The PDF cache was not cleared", body: body?.error || `The server said ${res.status}.` }); return; }
      const n = Array.isArray(body.deleted) ? body.deleted.length : Number(body.total ?? 0);
      toast.show({ tone: body.errors?.length ? "warning" : "success", title: n ? `Cleared ${n} cached PDF${n === 1 ? "" : "s"}` : "There were no cached PDFs", body: body.errors?.length ? `${body.errors.length} could not be deleted.` : "Each airport downloads its PDFs again when next opened." });
    } catch {
      setClearOpen(false);
      toast.show({ tone: "danger", title: "The PDF cache was not cleared", body: OFFLINE });
    } finally { setClearing(false); }
  }

  const off = state?.enabled === true;
  const offOk = typed.trim().toUpperCase() === "OFF";
  return (
    <PortalShell title="Maintenance control" subtitle="Turns the whole portal off for everyone except Admins and Developers.">
      <div className="flex max-w-[1100px] flex-col gap-5 pb-10" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {forbidden ? (
          <div className="rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1"><EmptyState icon="lock" title="Maintenance is for Admins and Developers">Your role can't turn the portal off or on.</EmptyState></div>
        ) : loadError ? (
          <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-cw-danger-border bg-cw-bg-surface p-6 shadow-cw-1">
            <ErrorState compact title="Can't tell whether the portal is on or off" detail={<>The switch is locked until the state loads.<br />{loadError}</>} onRetry={() => void load()} />
          </div>
        ) : !state ? (
          <>
            <div role="status" aria-label="Loading the maintenance state" className="flex items-center gap-5 rounded-[14px] border border-cw-border bg-cw-bg-surface p-7 shadow-cw-1">
              <Skeleton w={56} h={56} round={14} />
              <span className="flex flex-1 flex-col gap-2.5"><Skeleton w={260} h={18} round={5} /><Skeleton w="60%" shimmer={false} /></span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-cw-text-muted"><MaskIcon name="lock" size={14} />Controls stay locked until the current state has loaded, so nobody turns off a portal that is already off.</div>
          </>
        ) : off ? (
          // The portal is off: the whole card is red.
          <section aria-label="Current state" className="overflow-hidden rounded-[14px] border border-cw-danger-border bg-cw-bg-surface shadow-cw-1">
            <div className="flex flex-wrap items-center gap-5 bg-cw-danger-tint px-7 py-6">
              <span aria-hidden className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-cw-danger-solid text-cw-text-on-primary"><MaskIcon name="power" size={26} /></span>
              <div className="min-w-[240px] flex-1">
                <div className="text-[11px] font-bold tracking-[0.12em] text-cw-danger-text">CURRENT STATE</div>
                <h2 className="m-0 mt-0.5 text-[24px] font-extrabold tracking-[-0.02em] text-cw-text">The portal is off for everyone</h2>
                {state.since && <div className="mt-1 text-[13.5px] text-cw-text-body">Since <span className="font-mono">{zulu(state.since)}</span> ({ago(state.since)}){state.by ? <> · turned off by {state.by}</> : null}</div>}
              </div>
              {state.can.disable
                ? <Button variant="primary" size="lg" icon="power" loading={saving} loadingLabel="Turning on…" onClick={() => void save(false)}>Turn the portal back on</Button>
                : <span className="text-[13px] text-cw-text-body">Turning it back on needs “Turn maintenance off” (Admin → Permissions).</span>}
            </div>
            <div className="grid gap-6 px-7 py-5 md:grid-cols-2">
              <div><div className="mb-1 text-[12px] font-semibold text-cw-text-muted">Message shown</div><div className="text-[14px] text-cw-text">{state.message || "The generic message (none was given)."}</div></div>
              <div><div className="mb-1 text-[12px] font-semibold text-cw-text-muted">Expected back</div><div className="text-[14px] text-cw-text">{state.eta_text || "Not given"}</div></div>
            </div>
          </section>
        ) : (
          <section aria-label="Current state" className="rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
            <div className="flex items-center gap-5 border-b border-cw-divider px-7 py-6">
              <span aria-hidden className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-cw-success-tint"><span className="h-3.5 w-3.5 rounded-full bg-cw-success" /></span>
              <div className="flex-1">
                <div className="text-[11px] font-bold tracking-[0.12em] text-cw-success-text">CURRENT STATE</div>
                <h2 className="m-0 mt-0.5 text-[24px] font-extrabold tracking-[-0.02em] text-cw-text">The portal is live</h2>
                {state.lastEnded && <div className="mt-1 text-[13.5px] text-cw-text-body">Last maintenance ended <span className="font-mono">{zulu(state.lastEnded.at)}</span>{state.lastEnded.by ? <>, by {state.lastEnded.by}</> : null}.</div>}
              </div>
            </div>
            <div className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4 border-cw-divider px-7 py-6 md:border-r">
                <h3 className="m-0 text-[15px] font-bold">What people will see</h3>
                <Field label="Message" htmlFor="m-msg" hint="Shown on the maintenance page. Optional — leave it empty for a generic message.">
                  <TextArea id="m-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Moving the AIP store to a new server. Flight data is safe." disabled={!state.can.enable} />
                </Field>
                <Field label="Expected back" htmlFor="m-eta">
                  <TextInput id="m-eta" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. about 30 minutes" disabled={!state.can.enable} />
                </Field>
                <div aria-label="Preview of the maintenance page" className="flex flex-col items-center gap-1.5 rounded-[12px] border border-cw-border bg-cw-bg-sunken px-5 py-5 text-center">
                  <span className="text-[10.5px] font-bold tracking-[0.1em] text-cw-text-muted">PREVIEW</span>
                  <MaskIcon name="wrench" size={20} color="var(--cw-text-muted)" />
                  <div className="text-[16px] font-extrabold text-cw-text">Portal currently under maintenance</div>
                  <div className="text-[13px] text-cw-text-body">{message.trim() || "Maintenance is currently active for the portal."}</div>
                  {eta.trim() && <div className="text-[12.5px] text-cw-text-muted">Estimated time: {eta.trim()}</div>}
                </div>
              </div>
              <div className="flex flex-col gap-3.5 rounded-br-[14px] bg-cw-bg-sunken px-7 py-6">
                <h3 className="m-0 text-[15px] font-bold">When you turn it off</h3>
                {EFFECTS.map((e) => (
                  <div key={e.icon} className="flex gap-2.5 text-[13.5px] leading-normal text-cw-text-body"><span className="mt-0.5 flex-none"><MaskIcon name={e.icon} size={16} color={e.tone} /></span><span>{e.text}</span></div>
                ))}
                <div className="flex-1" />
                {state.can.enable ? (
                  <>
                    <Button variant="danger" size="lg" icon="power" onClick={() => { setTyped(""); setConfirmOff(true); }}>Turn the portal off…</Button>
                    <span className="text-center text-[12px] text-cw-text-muted">Asks you to type OFF before anything happens.</span>
                  </>
                ) : (
                  <Callout tone="info">Turning the portal off needs “Turn maintenance on” (Admin → Permissions) — Developers have it by default.</Callout>
                )}
              </div>
            </div>
          </section>
        )}

        {state?.can.clearCache && (
          <section aria-label="PDF cache" className="flex flex-wrap items-center gap-4 rounded-[14px] border border-cw-border bg-cw-bg-surface px-6 py-[18px] shadow-cw-1">
            <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-cw-border bg-cw-bg-sunken text-cw-text-muted"><MaskIcon name="hard-drive" size={16} /></span>
            <div className="min-w-[220px] flex-1"><div className="text-[15px] font-bold">PDF cache</div><div className="mt-0.5 text-[13px] text-cw-text-muted">Clearing it makes every airport download its PDFs again when next opened, which is slow.</div></div>
            <Button variant="danger-quiet" icon="trash-2" onClick={() => setClearOpen(true)}>Clear PDF cache…</Button>
          </section>
        )}
      </div>

      <Modal open={confirmOff} onClose={() => setConfirmOff(false)} busy={saving} tone="danger" icon="power" width={480} title="Turn the portal off for everyone?"
        actions={<>
          <Button onClick={() => setConfirmOff(false)} disabled={saving}>Keep it on</Button>
          <Button variant="danger" icon="power" disabled={!offOk} loading={saving} loadingLabel="Turning off…" onClick={() => void save(true)}>Turn off now</Button>
        </>}>
        Everyone except Admins and Developers gets the maintenance page from their next page load. Anything they haven&apos;t saved when they move is lost.
        <div className="mt-4">
          <Field label={<>Type <span className="rounded-[4px] bg-cw-bg-sunken px-1.5 font-mono">OFF</span> to confirm</>} htmlFor="m-confirm">
            <TextInput id="m-confirm" data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="h-10 font-mono"
              onKeyDown={(e) => { if (e.key === "Enter" && offOk && !saving) void save(true); }} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={clearOpen} danger icon="trash-2" title="Clear the PDF cache?" body="Every cached AIP PDF is deleted. Each airport downloads its PDFs again when next opened, which is slow." confirmLabel="Clear the cache" busy={clearing} busyLabel="Clearing…" onCancel={() => setClearOpen(false)} onConfirm={() => void clearCache()} />
    </PortalShell>
  );
}
