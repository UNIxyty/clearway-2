"use client";

// The component sheet (portal redesign, stage 2 — "Portal Components" in the design project): every component in
// components/kit, every state, rendered twice from the same markup — once inside data-theme="light", once inside
// data-theme="dark". Developer only (app/developer/layout.tsx). The data is invented.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PortalShell from "@/components/portal/Shell";
import {
  Badge, Button, Callout, Card, Checkbox, ConfirmDialog, CopyField, CountBadge, DataTable, DateInput, EmptyState, ErrorState, Field, FilterBar, FilteredStrip, IconButton,
  Kbd, MultiSelect, NoMatchState, RadioGroup, RoleBadge, SearchInput, Segmented, Select, SkeletonRows, TableCard, TextArea, TextInput, Toggle, errorDetail, filterReasons, useToast,
  type Column,
} from "@/components/kit";

const TIERS = [{ value: "auto", label: "Automatic" }, { value: "fast", label: "Fast · Haiku" }, { value: "standard", label: "Standard · Sonnet" }, { value: "reasoning", label: "Reasoning · Opus" }];
const ROLES = [{ value: "user", label: "User" }, { value: "admin", label: "Admin" }, { value: "developer", label: "Developer" }, { value: "pending", label: "Pending" }];
const SCOPES = [{ value: "site", label: "This site only" }, { value: "subdomains", label: "This site and subdomains" }, { value: "off", label: "Disabled option", disabled: true }];

type Person = { id: string; name: string; email: string; role: "pending" | "admin" | "developer" | "user"; when: string; minutes: number };
const PEOPLE: Person[] = [
  { id: "p1", name: "Anna Example", email: "anna@example.aero", role: "pending", when: "never", minutes: 1e9 },
  { id: "p2", name: "Ben Sample", email: "ben@example.aero", role: "admin", when: "2h ago", minutes: 120 },
  { id: "p3", name: "Cleo Demo", email: "cleo@example.aero", role: "developer", when: "now", minutes: 0 },
];
type Change = { id: string; t: string; who: string; granted: boolean; act: string; role: string };
const ACTS = ["File bug reports, and withdraw your own", "Delete other people’s bug reports", "Change a bug report’s status", "Delete an operator", "Show or hide aircraft on the wall", "Turn maintenance on", "Send flights to Leon", "Reveal a passenger’s personal data"];

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5" aria-label={`${n} ${title}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-cw-text-muted">{n} {title}</div>
      {children}
    </section>
  );
}
const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`rounded-[14px] border border-cw-border bg-cw-bg-surface p-6 shadow-cw-1 ${className}`}>{children}</div>;
const Caption = ({ children }: { children: ReactNode }) => <div className="text-[12px] font-semibold text-cw-text-muted">{children}</div>;

function Sheet({ theme }: { theme: "light" | "dark" }) {
  const toast = useToast();
  const [tier, setTier] = useState<string | null>("reasoning");
  const [roles, setRoles] = useState<string[]>(["admin", "developer"]);
  const [day, setDay] = useState<string | null>(new Date().toISOString().slice(0, 10));
  const [web, setWeb] = useState(false);
  const [voice, setVoice] = useState(true);
  const [cb, setCb] = useState(true);
  const [scope, setScope] = useState<string | null>("site");
  const [seg, setSeg] = useState("auto");
  const [q, setQ] = useState("");
  const [q2, setQ2] = useState("kerimova");
  const [name, setName] = useState("");
  const [loadingBtn, setLoadingBtn] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // Filter bar demo
  const [fSearch, setFSearch] = useState("EVR");
  const [status, setStatus] = useState<string[]>(["troubles", "partial"]);
  const [region, setRegion] = useState<string[]>(["europe"]);
  const [source, setSource] = useState<string[]>([]);
  const [verified, setVerified] = useState<string[]>([]);
  const [extra1, setExtra1] = useState<string[]>(["manual"]);
  const [extra2, setExtra2] = useState<string[]>([]);
  // Tables
  const [sel, setSel] = useState<Set<string>>(new Set(["p1"]));
  const [denseState, setDenseState] = useState<"ready" | "loading" | "error">("ready");
  const dense = useMemo<Change[]>(() => Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, t: `10 Oct ${String(23 - Math.floor(i / 60) % 24).padStart(2, "0")}:${String(59 - (i % 60)).padStart(2, "0")}Z`, who: ["ops.one@example.aero", "ops.two@example.aero", "admin@example.aero"][i % 3], granted: i % 3 !== 1, act: ACTS[i % ACTS.length], role: ["Admin", "User", "Developer"][i % 3] })), []);
  const people: Column<Person>[] = [
    { id: "user", header: "User", sortValue: (r) => r.name, cell: (r) => <span className="flex min-w-0 flex-col"><span className="font-semibold">{r.name}</span><span className="truncate font-mono text-[12px] text-cw-text-muted">{r.email}</span></span> },
    { id: "role", header: "Role", width: "130px", sortValue: (r) => r.role, cell: (r) => <RoleBadge role={r.role} /> },
    { id: "when", header: "Last active", sortValue: (r) => r.minutes, cell: (r) => <span className="font-mono text-[13px] text-cw-text-body">{r.when}</span> },
  ];
  const changes: Column<Change>[] = [
    { id: "t", header: "When", width: "150px", sortValue: (r) => r.id.slice(1).padStart(4, "0"), cell: (r) => <span className="font-mono text-[12px]">{r.t}</span> },
    { id: "who", header: "Who", cell: (r) => <span className="block max-w-[260px] truncate">{r.who}</span> },
    { id: "ch", header: "Change", width: "120px", cell: (r) => <Badge tone={r.granted ? "success" : "danger"} dot={false}>{r.granted ? "granted" : "took away"}</Badge> },
    { id: "act", header: "Action", sortValue: (r) => r.act, cell: (r) => <span className="text-cw-text">{r.act}</span> },
    { id: "role", header: "Role", width: "110px", sortValue: (r) => r.role, cell: (r) => r.role },
  ];
  const fake = (k: string) => { setLoadingBtn(k); setTimeout(() => setLoadingBtn(null), 1600); };
  const active = [status, region, source, verified, extra1, extra2].filter((v) => v.length).length;

  return (
    <div data-theme={theme} className="flex flex-col gap-10 rounded-[16px] bg-cw-bg-page p-8 text-cw-text" style={{ colorScheme: theme }}>
      <div className="flex items-center gap-3"><h2 className="m-0 text-[20px] font-extrabold tracking-[-0.01em]">{theme === "light" ? "Light" : "Dark"}</h2><Badge tone="neutral" dot={false}>data-theme=&quot;{theme}&quot;</Badge></div>

      <Section n="2.1" title="Buttons">
        <Panel className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] items-center gap-x-5 gap-y-4">
          <div />{["Rest · hover · active", "Focus (Tab to it)", "Loading", "Disabled"].map((c) => <Caption key={c}>{c}</Caption>)}
          {([["Primary", "primary", "check", "Approve", "Approving…"], ["Secondary", "secondary", "refresh-cw", "Re-check", "Checking…"], ["Quiet", "quiet", "download", "Export", "Exporting…"], ["Destructive", "danger", "power", "Turn off", "Turning off…"]] as const).map(([name, v, icon, label, busyLabel]) => (
            <Row key={v} name={name}>
              <Button variant={v} icon={icon} onClick={() => fake(v)} loading={loadingBtn === v} loadingLabel={busyLabel}>{label}</Button>
              <Button variant={v} icon={icon}>{label}</Button>
              <Button variant={v} icon={icon} loading loadingLabel={busyLabel}>{label}</Button>
              <Button variant={v} icon={icon} disabled>{label}</Button>
            </Row>
          ))}
          <div className="text-[13px] font-semibold">Destructive quiet</div>
          <div className="col-span-4 flex items-center gap-3"><Button variant="danger-quiet">Revoke</Button><Button variant="danger-quiet" disabled>Revoke</Button><span className="text-[12px] text-cw-text-muted">For a destructive action that is one of several in a row.</span></div>
          <div className="text-[13px] font-semibold">Sizes</div>
          <div className="col-span-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm">Small 30</Button><Button variant="primary">Medium 36</Button><Button variant="primary" size="lg">Large 44</Button>
            <IconButton icon="ellipsis" label="More actions" /><IconButton icon="copy" label="Copy" bordered size="md" />
            <span className="text-[12px] text-cw-text-muted">Icon-only buttons always carry a tooltip and aria-label.</span>
          </div>
        </Panel>
      </Section>

      <Section n="2.2" title="Form controls">
        <Panel className="grid grid-cols-4 items-start gap-x-6 gap-y-7">
          <div className="flex flex-col gap-3">
            <Caption>Text — rest · focus · error · read-only</Caption>
            <Field label="Display name" htmlFor={`${theme}-name`}><TextInput id={`${theme}-name`} placeholder="e.g. Anna Example" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Host" error="Enter a host such as handling-baltic.lv"><TextInput mono invalid defaultValue="handling-baltic" aria-label="Host" /></Field>
            <CopyField label="request id" value="1ff82eab-6266-40bc-9c1e-7a2f0e5d1b44" />
            <TextArea placeholder="Notes" aria-label="Notes" />
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Select</Caption>
            <Select label="Default model" value={tier} onChange={setTier} options={TIERS} />
            <Select label="Default model (disabled)" value="fast" onChange={() => {}} options={TIERS} disabled />
            <Select label="Empty" value={null} onChange={setTier} options={TIERS} placeholder="Choose a tier" invalid />
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Multi-select</Caption>
            <MultiSelect label="Roles" values={roles} onChange={setRoles} options={ROLES} counts={{ user: 18, admin: 3, developer: 1, pending: 1 }} />
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Date (UTC)</Caption>
            <DateInput label="Flight date" value={day} onChange={setDay} />
          </div>
          <div className="flex flex-col gap-3.5">
            <Caption>Toggle — off · on · disabled</Caption>
            <Toggle checked={web} onChange={setWeb} label="Web search" />
            <Toggle checked={voice} onChange={setVoice} label="Voice" hint="Answers can be read aloud." />
            <Toggle checked={false} onChange={() => {}} label="Locked by admin" disabled />
          </div>
          <div className="flex flex-col gap-3.5">
            <Caption>Checkbox — off · on · mixed · disabled</Caption>
            <div className="flex items-center gap-3.5"><Checkbox checked={false} onChange={() => {}} ariaLabel="Off" /><Checkbox checked onChange={() => {}} ariaLabel="On" /><Checkbox checked="mixed" onChange={() => {}} ariaLabel="Mixed" /><Checkbox checked={false} disabled onChange={() => {}} ariaLabel="Disabled" /><Checkbox checked disabled onChange={() => {}} ariaLabel="Disabled, on" /></div>
            <Checkbox checked={cb} onChange={setCb} label="Include subdomains" />
          </div>
          <div className="flex flex-col gap-3.5">
            <Caption>Radio — group</Caption>
            <RadioGroup label="Scope" value={scope} onChange={setScope} options={SCOPES} />
          </div>
          <div className="flex flex-col gap-3">
            <Caption>Search — empty · with value</Caption>
            <SearchInput value={q} onValueChange={setQ} placeholder="Search users" shortcut="/" aria-label="Search users" />
            <SearchInput value={q2} onValueChange={setQ2} placeholder="Search users" count="1 of 23" aria-label="Search users (with value)" />
          </div>
          <div className="col-span-4 flex flex-wrap items-center gap-6 border-t border-cw-divider pt-5">
            <Caption>Segmented</Caption>
            <Segmented label="Model tier" value={seg} onChange={setSeg} options={TIERS} />
            <span className="text-[12px] text-cw-text-muted">Every control is a styled element with full keyboard support. No native select, checkbox, radio or date input is rendered.</span>
          </div>
        </Panel>
      </Section>

      <Section n="2.3" title="Filter bar — two filters, none active · six filters, three active">
        <TableCard>
          <FilterBar search={q} onSearch={setQ} searchPlaceholder="Search users" count="23 users"
            filters={[{ id: "role", label: "Role", options: ROLES, values: [], onChange: () => {} }, { id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "pending", label: "Pending" }], values: [], onChange: () => {} }]} />
          <FilterBar search={fSearch} onSearch={setFSearch} searchPlaceholder="Search countries"
            filters={[
              { id: "status", label: "Status", icon: "circle-dot", options: [{ value: "troubles", label: "Troubles" }, { value: "partial", label: "Partial" }, { value: "ok", label: "Operational" }], values: status, onChange: setStatus, counts: { troubles: 7, partial: 2, ok: 113 } },
              { id: "region", label: "Region", icon: "globe", options: [{ value: "europe", label: "Europe" }, { value: "asia", label: "Asia" }, { value: "africa", label: "Africa" }], values: region, onChange: setRegion },
              { id: "source", label: "Source", options: [{ value: "ead", label: "EAD" }, { value: "national", label: "National eAIP" }], values: source, onChange: setSource },
              { id: "verified", label: "Verified by", options: [{ value: "me", label: "Me" }, { value: "others", label: "Others" }], values: verified, onChange: setVerified },
              { id: "method", label: "Method", options: [{ value: "manual", label: "Manual" }, { value: "auto", label: "Automatic" }], values: extra1, onChange: setExtra1 },
              { id: "age", label: "Checked", options: [{ value: "week", label: "This week" }, { value: "older", label: "Older" }], values: extra2, onChange: setExtra2 },
            ]} />
          {(active > 0 || fSearch) && <FilteredStrip shown={4} total={231} reasons={filterReasons(active, Boolean(fSearch))} onClear={() => { setFSearch(""); [setStatus, setRegion, setSource, setVerified, setExtra1, setExtra2].forEach((f) => f([])); }} />}
          <div className="px-4 py-3.5 text-[12px] leading-relaxed text-cw-text-muted">Up to 4 filters sit inline (most used first); the rest go into <strong>More filters</strong>, whose badge counts the active ones there. An active filter is a filled chip with its value and an ✕. Whenever anything is filtered, a strip states how many rows are hidden — a filtered list never looks like the full list.</div>
        </TableCard>
      </Section>

      <Section n="2.4" title="Table — comfortable, selection and row menu">
        <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start gap-5">
          <TableCard>
            <DataTable label={`People (${theme})`} columns={people} rows={PEOPLE} rowKey={(r) => r.id} selectable selected={sel} onSelectedChange={setSel}
              bulkActions={() => <Button size="sm" onClick={() => toast.show({ tone: "success", title: "Password reset sent", body: "Example only." })}>Send password reset</Button>}
              rowMenu={(r) => [
                { id: "admin", label: "Make admin", icon: "shield", onSelect: () => toast.show({ tone: "success", title: `${r.name} is now an Admin`, body: "Takes effect within 10 seconds.", action: { label: "Undo", onClick: () => {} } }) },
                { id: "dev", label: "Make developer", icon: "terminal", onSelect: () => {} },
                { id: "reset", label: "Send password reset", icon: "key-round", onSelect: () => {} },
                { id: "remove", label: "Remove admin", icon: "shield-off", danger: true, onSelect: () => setConfirm(true) },
              ]}
              empty={{ title: "No users yet" }} />
          </TableCard>
          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-cw-text-body">
            <Card title="Density" padded>Comfortable rows 52px (two-line cells). Dense rows 32px. Header 36px, 32px when dense. Cell padding 0 16px.</Card>
            <Card title="Behaviour" padded>Click a header to sort ascending, again for descending, a third click clears. The ⋯ button is always visible, so it is reachable by keyboard. Selecting a row replaces the toolbar with the bulk-action bar.</Card>
          </div>
        </div>
      </Section>

      <Section n="2.4" title="Table — dense, 500 rows: sticky header, pagination">
        <div className="flex items-center gap-3"><Caption>State</Caption><Segmented size="sm" label="Table state" value={denseState} onChange={(v) => setDenseState(v)} options={[{ value: "ready", label: "Ready" }, { value: "loading", label: "Loading" }, { value: "error", label: "Error" }]} /></div>
        <TableCard>
          <DataTable label={`Permission changes (${theme})`} density="dense" columns={changes} rows={dense} rowKey={(r) => r.id} state={denseState} defaultSort={{ id: "t", dir: "asc" }}
            error={{ title: "Couldn't load the change log", detail: errorDetail(502, "GET", "/api/admin/permissions"), onRetry: () => setDenseState("ready"), onReport: () => {} }}
            empty={{ title: "No changes yet" }} />
        </TableCard>
        <div className="text-[12px] text-cw-text-muted">The header sticks under the top bar and gains a shadow once the page scrolls past it. Above 50 rows the table paginates; below 50 the footer shows only the count. Tables never scroll inside their own box — the page scrolls.</div>
      </Section>

      <Section n="2.5" title="Empty · no match · loading · error (inside a table card)">
        <div className="grid grid-cols-4 gap-5">
          <TableCard><div className="flex h-9 items-center rounded-t-[13px] border-b border-cw-border bg-cw-bg-sunken px-4 text-[11px] font-bold tracking-[0.06em] text-cw-text-muted">HIDDEN AIRPORTS</div><EmptyState icon="eye-off" title="You haven't hidden any airports">Hide one from its airport page. It will show here so you can bring it back.</EmptyState></TableCard>
          <TableCard><div className="flex h-9 items-center gap-2 rounded-t-[13px] border-b border-cw-primary-tint-border bg-cw-bg-selected px-4 text-[12.5px]"><span className="text-cw-text-link">⦿</span><strong>0 of 101</strong> · search “zzzz”</div><NoMatchState title="No actions match “zzzz”" clearLabel="Clear search" onClear={() => {}}>Search looks at action names and keys like <span className="font-mono">wall.operators.delete</span>.</NoMatchState></TableCard>
          <TableCard><div className="flex h-9 items-center gap-10 rounded-t-[13px] border-b border-cw-border bg-cw-bg-sunken px-4"><span className="h-2 w-[60px] rounded bg-cw-skeleton" /><span className="h-2 w-10 rounded bg-cw-skeleton" /></div><SkeletonRows rows={5} /></TableCard>
          <TableCard><div className="flex h-9 items-center rounded-t-[13px] border-b border-cw-border bg-cw-bg-sunken px-4 text-[11px] font-bold tracking-[0.06em] text-cw-text-muted">USERS</div><ErrorState title="Couldn't load users" detail={errorDetail(502, "GET", "/api/admin/users")} onRetry={() => {}} onReport={() => {}} /></TableCard>
        </div>
        <div className="text-[12px] leading-relaxed text-cw-text-muted">Two kinds of empty: <strong>nothing exists yet</strong> (explain how things get here) and <strong>nothing matches</strong> (say what hid them and offer to clear). Loading draws the shape of what is coming — never a bare “Loading…”. Errors name what failed, keep the status code visible, and offer a retry.</div>
      </Section>

      <Section n="2.6" title="Cards · badges · callouts · tooltip · modal · toasts">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-5">
          <div className="flex flex-col gap-5">
            <Card title="Card title" icon="activity" description="Optional description" meta="18:24Z" footer={<><Button size="sm" variant="quiet">Cancel</Button><Button size="sm" variant="primary">Save</Button></>}>Body 20px padding. Header 52px. Footer, when present, 48px on bg-sunken.</Card>
            <Panel className="flex flex-col gap-3 !p-5">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="success">Operational</Badge><Badge tone="warning">Degraded</Badge><Badge tone="danger">Down</Badge><Badge tone="info">Syncing</Badge><Badge tone="orange">In work</Badge><Badge tone="neutral">Not checked</Badge><Badge tone="diff">Changed</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5"><RoleBadge role="developer" /><RoleBadge role="admin" /><RoleBadge role="user" /><RoleBadge role="pending" /><CountBadge n={10} /><CountBadge n={3} tone="danger" /><Kbd>⌘K</Kbd></div>
            </Panel>
            <div className="flex flex-col gap-2.5">
              <Callout tone="info" title="Takes effect within 10 seconds">Every server checks these permissions itself.</Callout>
              <Callout tone="warning" title="Hard to undo">Whoever holds this can grant any other permission.</Callout>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <Panel className="flex justify-center !pt-12">
              <IconButton icon="bot" label="Open the agent" shortcut="⌘J" bordered size="md" />
              <span className="ml-3 self-center text-[12px] text-cw-text-muted">Hover, or Tab to it</span>
            </Panel>
            <Panel className="flex flex-col gap-2 !p-5">
              <Caption>Toasts — open one</Caption>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => toast.show({ tone: "success", title: "Ben Sample is now an Admin", body: "Takes effect within 10 seconds.", action: { label: "Undo", onClick: () => {} } })}>Success</Button>
                <Button size="sm" onClick={() => toast.show({ tone: "warning", title: "Saved, but the wall is offline", body: "It will pick this up when it reconnects." })}>Warning</Button>
                <Button size="sm" onClick={() => toast.show({ tone: "danger", title: "Couldn’t send the reset email", body: "Resend returned 429 · try again in a minute.", action: { label: "Retry", onClick: () => {} } })}>Error</Button>
              </div>
            </Panel>
          </div>
          <Panel className="flex flex-col items-start gap-3 !p-5">
            <Caption>Modal</Caption>
            <Button variant="danger-quiet" icon="user-x" onClick={() => setConfirm(true)}>Remove Admin…</Button>
            <span className="text-[12px] text-cw-text-muted">Focus stays inside; Esc or the scrim closes it; focus returns to the button.</span>
          </Panel>
        </div>
      </Section>
      <ConfirmDialog open={confirm} danger icon="user-x" title="Remove Admin from Ben Sample?" body="They keep their account and can still sign in as a User. They lose Admin pages straight away."
        confirmLabel="Remove Admin" busyLabel="Removing…" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => { setBusy(true); setTimeout(() => { setBusy(false); setConfirm(false); }, 1200); }} />
    </div>
  );
}
function Row({ name, children }: { name: string; children: ReactNode }) {
  return <><div className="text-[13px] font-semibold">{name}</div>{children}</>;
}

export default function ComponentSheetPage() {
  // Rendered after mount: the demos show today's date and the current time, which the server cannot know.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <PortalShell title="Component sheet" subtitle="Every component in the portal kit (components/kit), in every state, in both themes — the same markup rendered inside data-theme=&quot;light&quot; and data-theme=&quot;dark&quot;.">
      <div className="flex flex-col gap-8 pb-10" style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        {mounted ? <><Sheet theme="light" /><Sheet theme="dark" /></> : <SkeletonRows rows={8} label="Loading the component sheet" />}
      </div>
    </PortalShell>
  );
}
