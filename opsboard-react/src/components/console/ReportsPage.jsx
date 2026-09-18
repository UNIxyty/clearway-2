import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createReport,
  deleteReport,
  fetchReports,
  saveReportsConfig,
  sendReport,
  updateReport,
} from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import useViewport from '../../hooks/useViewport';
import { BottomSheet, ChipRow } from './mobile';
import Icon from './icons';
import {
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorBanner,
  FieldLabel,
  IconButton,
  LoadingState,
  MonoChip,
  PageHeader,
  SearchBox,
  StatusPill,
  t,
  TableShell,
  TextArea,
  TextInput,
  timeAgo,
  useToast,
} from './ui';

// Reports (bug report item 13): internal issue/request tracker. Ops raise a
// report (IT, Office, …), track it through a fixed status lifecycle, and
// route it to the right inbox through the branded Resend template.

const STATUSES = [
  { value: 'untouched', label: 'Untouched', c: '#b45309', b: '#fef3e2' },
  { value: 'under_process', label: 'Under process', c: '#1d4ed8', b: '#e8effe' },
  { value: 'done', label: 'Done', c: '#15803d', b: '#e7f6ec' },
  { value: 'impossible', label: 'Impossible', c: '#e5484d', b: '#fdecec' },
];
const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

function StatusChip({ value }) {
  const s = STATUS_BY_VALUE[value] || STATUSES[0];
  return <StatusPill color={s.c} bg={s.b}>{s.label}</StatusPill>;
}

/** Quick status switcher — the main day-to-day action, right in the list. */
function StatusQuickPick({ report, onChanged }) {
  const [open, setOpen] = useState(false);
  const flash = useToast();
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <StatusChip value={report.status} />
      </span>
      {open && (
        <span style={{ position: 'absolute', top: '110%', left: 0, zIndex: 30, background: '#fff', border: `1px solid ${t.borderInput}`, borderRadius: 10, boxShadow: t.shadowPanel, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="cw-hover-surface"
              style={{ border: 'none', background: report.status === s.value ? s.b : 'transparent', color: s.c, fontWeight: 700, fontSize: 12.5, textAlign: 'left', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={async (e) => {
                e.stopPropagation();
                setOpen(false);
                try {
                  await updateReport(report.id, { status: s.value });
                  flash(`${report.title.slice(0, 30)} → ${s.label}`);
                  onChanged();
                } catch (err) { flash(String(err.message || err), '#f87171'); }
              }}
            >
              {s.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function emptyForm(categories) {
  return { id: '', category: categories[0] || 'Other', title: '', body: '', status: 'untouched' };
}

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [presets, setPresets] = useState([]);
  const [mailerOk, setMailerOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // null = closed
  const [saving, setSaving] = useState(false);
  const [sendFor, setSendFor] = useState(null); // report being sent
  const [sendTo, setSendTo] = useState([]); // selected emails
  const [sendExtra, setSendExtra] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [presetDraft, setPresetDraft] = useState([]);
  const flash = useToast();
  // <768 (C9): status cards + the change-status bottom sheet.
  const { width } = useViewport();
  const isPhone = width < 768;
  const [sheetFor, setSheetFor] = useState(null);
  const [sheetStatus, setSheetStatus] = useState('');
  const [sheetNote, setSheetNote] = useState('');
  const [sheetBusy, setSheetBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const payload = await fetchReports();
      setReports(payload.reports || []);
      setCategories(payload.categories || []);
      setPresets(payload.presets || []);
      setMailerOk(payload.mailerConfigured !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return subscribeWallStream('reports.changed', load, { surface: 'console' });
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports
      .filter((r) => (statusFilter ? r.status === statusFilter : true))
      .filter((r) => (categoryFilter ? r.category === categoryFilter : true))
      .filter((r) => (q ? `${r.title} ${r.body} ${r.category} ${r.createdBy || ''}`.toLowerCase().includes(q) : true));
  }, [reports, statusFilter, categoryFilter, search]);

  async function save() {
    if (!form?.title.trim()) return;
    setSaving(true);
    try {
      const category = form.category === '__new__' ? (form.newCategory || '').trim() || 'Other' : form.category;
      const body = { category, title: form.title, body: form.body, status: form.status };
      if (form.id) await updateReport(form.id, body);
      else await createReport(body);
      flash(form.id ? 'Report updated' : 'Report created');
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function doSend() {
    const extra = sendExtra.trim();
    const to = [...sendTo, ...(extra && /.+@.+\..+/.test(extra) ? [extra] : [])];
    if (to.length === 0) { setSendError('Pick a preset or enter a valid email.'); return; }
    setSending(true);
    setSendError('');
    try {
      const payload = await sendReport(sendFor.id, to);
      flash(`Sent to ${to.join(', ')} ✓`);
      setSendFor(null); setSendTo([]); setSendExtra('');
      await load();
      return payload;
    } catch (err) {
      // LOUD failure: stays on screen until dismissed/retried.
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const filterBtn = (on) => ({
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? t.blue : t.borderInput}`, background: on ? t.blueTint : '#fff',
    color: on ? t.blueDeep : t.muted, borderRadius: 8, padding: '6px 12px',
  });

  // C9: one interaction closes the loop — status radios + the optional note
  // in the same sheet. The note is appended to the report body (the tracker
  // has no separate notes store).
  async function applySheetStatus() {
    if (!sheetFor || sheetBusy) return;
    setSheetBusy(true);
    try {
      const note = sheetNote.trim();
      const patch = { status: sheetStatus };
      if (note) patch.body = `${sheetFor.body ? `${sheetFor.body}\n\n` : ''}Note: ${note}`;
      await updateReport(sheetFor.id, patch);
      flash(`${sheetFor.title.slice(0, 30)} → ${STATUS_BY_VALUE[sheetStatus]?.label || sheetStatus}`);
      setSheetFor(null);
      setSheetNote('');
      await load();
    } catch (err) {
      flash(String(err.message || err), '#f87171');
    } finally {
      setSheetBusy(false);
    }
  }

  // ── <768 (C9): cards ordered by status; tap = change-status sheet ────────
  if (isPhone) {
    const statusIndex = (r) => {
      const i = STATUSES.findIndex((s) => s.value === r.status);
      return i === -1 ? STATUSES.length : i;
    };
    const ordered = [...visible].sort(
      (a, b) => statusIndex(a) - statusIndex(b) || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
    const counts = STATUSES.map((s) => ({ ...s, n: reports.filter((r) => r.status === s.value).length })).filter((s) => s.n > 0);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: t.faint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {counts.map((s) => `${s.n} ${s.label.toLowerCase()}`).join(' · ') || 'No reports yet'}
          </span>
          <Button variant="primary" icon="plus" size="sm" onClick={() => setForm(emptyForm(categories))} style={{ height: 40, flex: 'none' }}>
            New report
          </Button>
        </div>

        {!mailerOk && (
          <div style={{ marginBottom: 12, fontSize: 13, color: '#92500b', background: t.amberTint, border: '1px solid rgba(180,120,20,.35)', borderRadius: 11, padding: '10px 13px' }}>
            Email is not configured on this backend (RESEND_API_KEY) — reports can be tracked but not sent.
          </div>
        )}
        <ErrorBanner>{error}</ErrorBanner>

        {form && (
          <Card className="cw-fade" style={{ border: `1px solid ${t.blueBorder}`, marginBottom: 14, padding: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>{form.id ? 'Edit report' : 'New report'}</h3>
            <FieldLabel>Category</FieldLabel>
            {form.category === '__new__' ? (
              <TextInput
                autoFocus
                placeholder="New category name"
                value={form.newCategory || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, newCategory: e.target.value }))}
                style={{ marginBottom: 12, height: 48 }}
              />
            ) : (
              <div style={{ marginBottom: 12 }}>
                <Dropdown
                  label="Category"
                  value={form.category}
                  options={[...categories.map((c) => ({ value: c, label: c })), { value: '__new__', label: '+ New category…' }]}
                  onChange={(v) => setForm((prev) => ({ ...prev, category: v, newCategory: '' }))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <FieldLabel>Title</FieldLabel>
            <TextInput
              placeholder="Short summary"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              style={{ marginBottom: 12, height: 48 }}
            />
            <FieldLabel>Description</FieldLabel>
            <TextArea rows={4} placeholder="What happened / what is needed" value={form.body} onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button
                variant="primary"
                disabled={saving || !form.title.trim()}
                spin={saving}
                onClick={save}
                style={{ flex: 1, height: 48, fontWeight: 700, borderRadius: 12 }}
              >
                {form.id ? 'Save changes' : 'Create report'}
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)} style={{ height: 48 }}>Cancel</Button>
            </div>
          </Card>
        )}

        {sendFor && (
          <Card className="cw-fade" style={{ border: '1px solid rgba(37,99,235,.4)', marginBottom: 14, padding: 16 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 4px' }}>Send “{sendFor.title}”</h3>
            <p style={{ fontSize: 13, color: t.muted, margin: '0 0 12px' }}>Pick preset recipients and/or add an address.</p>
            {sendError && (
              <div style={{ marginBottom: 12, fontSize: 13.5, fontWeight: 600, color: '#b91c1c', background: '#fdecec', border: '1px solid #f6c6c6', borderRadius: 10, padding: '10px 14px' }}>
                {sendError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {presets.map((preset) => {
                const on = sendTo.includes(preset.email);
                return (
                  <button key={preset.email} type="button" style={{ ...filterBtn(on), minHeight: 44 }} onClick={() => setSendTo((prev) => (on ? prev.filter((e) => e !== preset.email) : [...prev, preset.email]))}>
                    {preset.label} <span style={{ fontFamily: t.mono, fontWeight: 500 }}>({preset.email})</span>
                  </button>
                );
              })}
              {presets.length === 0 && <span style={{ fontSize: 12.5, color: t.faint }}>No presets yet — add them via “Recipient presets”.</span>}
            </div>
            <TextInput mono placeholder="or type an address…" value={sendExtra} onChange={(e) => setSendExtra(e.target.value)} style={{ marginBottom: 10, height: 48 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="primary" icon="send" disabled={sending} spin={sending} onClick={doSend} style={{ flex: 1, height: 48, fontWeight: 700, borderRadius: 12 }}>
                Send report
              </Button>
              <Button variant="ghost" onClick={() => { setSendFor(null); setSendTo([]); setSendExtra(''); setSendError(''); }} style={{ height: 48 }}>Cancel</Button>
            </div>
          </Card>
        )}

        <SearchBox value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, body, category, creator…" style={{ marginBottom: 10, height: 44 }} />
        <ChipRow style={{ marginBottom: 12 }}>
          <button type="button" style={{ ...filterBtn(statusFilter === ''), minHeight: 34, flex: 'none' }} onClick={() => setStatusFilter('')}>All statuses</button>
          {STATUSES.map((s) => (
            <button key={s.value} type="button" style={{ ...filterBtn(statusFilter === s.value), minHeight: 34, flex: 'none' }} onClick={() => setStatusFilter((prev) => (prev === s.value ? '' : s.value))}>
              {s.label}
            </button>
          ))}
        </ChipRow>

        {loading && <LoadingState>Loading reports…</LoadingState>}
        {!loading && ordered.length === 0 && (
          <Card style={{ padding: 0 }}>
            <EmptyState icon="clipboard-check" title="No reports">
              Raise the first one with “New report”.
            </EmptyState>
          </Card>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {ordered.map((report) => (
            <div
              key={report.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSheetFor(report);
                setSheetStatus(report.status);
                setSheetNote('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && setSheetFor(report)}
              style={{
                background: t.card,
                border: `1px solid ${t.border}`,
                borderRadius: 13,
                padding: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <StatusChip value={report.status} />
                <MonoChip color="#1d4ed8" bg="#e8effe">{report.category}</MonoChip>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: t.faint, flex: 'none' }}>{timeAgo(report.updatedAt || report.createdAt)}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>{report.title}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: t.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {report.createdBy ? String(report.createdBy).split('@')[0] : '—'}
                  {(report.sends || []).length > 0 ? ` · ✉ ${report.sends[report.sends.length - 1].to.join(', ')}` : ''}
                </span>
                <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
                  <IconButton icon="send" title="Send to email" size={34} onClick={() => { setSendFor(report); setSendTo([]); setSendExtra(''); setSendError(''); }} />
                  <IconButton icon="pencil" title="Edit" size={34} onClick={() => setForm({ id: report.id, category: report.category, title: report.title, body: report.body, status: report.status })} />
                  <IconButton icon="trash-2" title="Delete" size={34} onClick={() => setConfirmDelete(report)} />
                </span>
              </div>
            </div>
          ))}
        </div>

        <BottomSheet open={Boolean(sheetFor)} onClose={() => setSheetFor(null)}>
          {sheetFor && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: t.ink, letterSpacing: '-0.015em' }}>Change status</span>
                <span style={{ fontFamily: t.mono, fontSize: 11.5, color: t.faint }}>{sheetFor.category}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: t.muted }}>{sheetFor.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STATUSES.map((s) => {
                  const on = sheetStatus === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSheetStatus(s.value)}
                      style={{
                        fontFamily: 'inherit',
                        height: 52,
                        borderRadius: 12,
                        border: on ? `1.5px solid ${t.blue}` : `1px solid ${t.border}`,
                        background: on ? t.blueWash : t.card,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 14px',
                        gap: 11,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: on ? `6px solid ${t.blue}` : `1.5px solid ${t.borderInput}`,
                          background: '#fff',
                          flex: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: 14.5, fontWeight: on ? 700 : 600, color: on ? t.blueDeep : t.ink, flex: 1 }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              <TextArea
                placeholder="Add a note for the reporter (optional)"
                value={sheetNote}
                onChange={(e) => setSheetNote(e.target.value)}
                style={{ minHeight: 72, background: t.subtle, borderRadius: 12 }}
              />
              <Button
                variant="primary"
                spin={sheetBusy}
                disabled={sheetBusy}
                onClick={applySheetStatus}
                style={{ height: 48, fontSize: 14.5, fontWeight: 700, borderRadius: 12 }}
              >
                Update status
              </Button>
            </>
          )}
        </BottomSheet>

        <ConfirmDialog
          open={Boolean(confirmDelete)}
          title={`Delete report "${confirmDelete?.title ?? ''}"?`}
          body="The report and its send history are removed. This cannot be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            try { await deleteReport(confirmDelete.id); flash('Report deleted', '#f87171'); setConfirmDelete(null); await load(); }
            catch (err) { setError(String(err.message || err)); setConfirmDelete(null); }
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        desc="Internal issue & request tracker — raise a report, keep its status current, and route it to the right inbox."
        actions={
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <Button variant="soft" icon="mail-check" onClick={() => { setPresetDraft(presets.length ? [...presets] : [{ label: 'IT', email: '' }]); setPresetsOpen((v) => !v); }}>
              Recipient presets
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setForm(emptyForm(categories))}>
              New report
            </Button>
          </span>
        }
      />

      {!mailerOk && (
        <div style={{ marginBottom: 16, fontSize: 13.5, color: '#92500b', background: t.amberTint, border: '1px solid rgba(180,120,20,.35)', borderRadius: 11, padding: '11px 15px' }}>
          Email is not configured on this backend (RESEND_API_KEY) — reports can be tracked but not sent.
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>

      {presetsOpen && (
        <Card style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Recipient presets</h3>
          <p style={{ fontSize: 13, color: t.muted, margin: '0 0 12px' }}>
            Map a short label to an address so ops pick “IT” instead of typing emails.
          </p>
          {presetDraft.map((preset, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <TextInput placeholder="Label (e.g. IT)" value={preset.label} onChange={(e) => setPresetDraft((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))} style={{ width: 180 }} />
              <TextInput mono placeholder="email@clearway.aero" value={preset.email} onChange={(e) => setPresetDraft((prev) => prev.map((p, j) => (j === i ? { ...p, email: e.target.value } : p)))} />
              <IconButton icon="x" title="Remove" onClick={() => setPresetDraft((prev) => prev.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="soft" icon="plus" onClick={() => setPresetDraft((prev) => [...prev, { label: '', email: '' }])}>Add row</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                try {
                  const payload = await saveReportsConfig({ presets: presetDraft });
                  setPresets(payload.presets || []);
                  setPresetsOpen(false);
                  flash('Presets saved');
                } catch (err) { setError(String(err.message || err)); }
              }}
            >
              Save presets
            </Button>
          </div>
        </Card>
      )}

      {form && (
        <Card className="cw-fade" style={{ border: `1px solid ${t.blueBorder}`, marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 14px' }}>{form.id ? 'Edit report' : 'New report'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, marginBottom: 12 }}>
            <div>
              <FieldLabel>Category</FieldLabel>
              {form.category === '__new__' ? (
                <TextInput
                  autoFocus
                  placeholder="New category name"
                  value={form.newCategory || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, newCategory: e.target.value }))}
                />
              ) : (
                <Dropdown
                  label="Category"
                  value={form.category}
                  options={[
                    ...categories.map((c) => ({ value: c, label: c })),
                    { value: '__new__', label: '+ New category…' },
                  ]}
                  onChange={(v) => setForm((prev) => ({ ...prev, category: v, newCategory: '' }))}
                  style={{ width: '100%' }}
                />
              )}
            </div>
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput placeholder="Short summary" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
          </div>
          <FieldLabel>Description</FieldLabel>
          <TextArea rows={4} placeholder="What happened / what is needed" value={form.body} onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <FieldLabel>Status</FieldLabel>
            {STATUSES.map((s) => (
              <button key={s.value} type="button" style={filterBtn(form.status === s.value)} onClick={() => setForm((prev) => ({ ...prev, status: s.value }))}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="primary" size="lg" disabled={saving || !form.title.trim()} spin={saving} onClick={save}>
              {form.id ? 'Save changes' : 'Create report'}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {sendFor && (
        <Card className="cw-fade" style={{ border: '1px solid rgba(37,99,235,.4)', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Send “{sendFor.title}”</h3>
          <p style={{ fontSize: 13, color: t.muted, margin: '0 0 12px' }}>Pick preset recipients and/or add an address.</p>
          {sendError && (
            <div style={{ marginBottom: 12, fontSize: 13.5, fontWeight: 600, color: '#b91c1c', background: '#fdecec', border: '1px solid #f6c6c6', borderRadius: 10, padding: '10px 14px' }}>
              {sendError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {presets.map((preset) => {
              const on = sendTo.includes(preset.email);
              return (
                <button key={preset.email} type="button" style={filterBtn(on)} onClick={() => setSendTo((prev) => (on ? prev.filter((e) => e !== preset.email) : [...prev, preset.email]))}>
                  {preset.label} <span style={{ fontFamily: t.mono, fontWeight: 500 }}>({preset.email})</span>
                </button>
              );
            })}
            {presets.length === 0 && <span style={{ fontSize: 12.5, color: t.faint }}>No presets yet — add them via “Recipient presets”.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TextInput mono placeholder="or type an address…" value={sendExtra} onChange={(e) => setSendExtra(e.target.value)} style={{ maxWidth: 320 }} />
            <Button variant="primary" icon="send" disabled={sending} spin={sending} onClick={doSend}>Send report</Button>
            <Button variant="ghost" onClick={() => { setSendFor(null); setSendTo([]); setSendExtra(''); setSendError(''); }}>Cancel</Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search title, body, category, creator…" />
        <button type="button" style={filterBtn(statusFilter === '')} onClick={() => setStatusFilter('')}>All statuses</button>
        {STATUSES.map((s) => (
          <button key={s.value} type="button" style={filterBtn(statusFilter === s.value)} onClick={() => setStatusFilter((prev) => (prev === s.value ? '' : s.value))}>
            {s.label}
          </button>
        ))}
        <span style={{ width: 10 }} />
        <button type="button" style={filterBtn(categoryFilter === '')} onClick={() => setCategoryFilter('')}>All categories</button>
        {categories.map((c) => (
          <button key={c} type="button" style={filterBtn(categoryFilter === c)} onClick={() => setCategoryFilter((prev) => (prev === c ? '' : c))}>
            {c}
          </button>
        ))}
      </div>

      <TableShell
        columns=".7fr 2fr 1fr 1.1fr 1.1fr .8fr"
        header={[
          { label: 'CATEGORY' },
          { label: 'REPORT' },
          { label: 'STATUS' },
          { label: 'CREATED' },
          { label: 'LAST UPDATE' },
          { label: 'ACTIONS', align: 'right' },
        ]}
      >
        {loading && <LoadingState>Loading reports…</LoadingState>}
        {!loading && visible.length === 0 && (
          <EmptyState icon="clipboard-check" title="No reports">
            Raise the first one with “New report”.
          </EmptyState>
        )}
        {visible.map((report) => (
          <div key={report.id} style={{ padding: '13px 18px', borderBottom: `1px solid ${t.rowLine}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '.7fr 2fr 1fr 1.1fr 1.1fr .8fr', alignItems: 'center', gap: 8 }}>
              <div><MonoChip color="#1d4ed8" bg="#e8effe">{report.category}</MonoChip></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{report.title}</div>
                {report.body && <div style={{ fontSize: 12.5, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{report.body}</div>}
                {(report.sends || []).length > 0 && (
                  <div style={{ fontSize: 11.5, color: t.faint, marginTop: 2 }}>
                    ✉ sent to {report.sends[report.sends.length - 1].to.join(', ')} · {timeAgo(report.sends[report.sends.length - 1].at)}
                  </div>
                )}
              </div>
              <div><StatusQuickPick report={report} onChanged={load} /></div>
              <div style={{ fontSize: 12.5, color: t.muted }}>
                {report.createdBy ? String(report.createdBy).split('@')[0] : '—'} · {timeAgo(report.createdAt)}
              </div>
              <div style={{ fontSize: 12.5, color: t.muted }}>
                {report.updatedBy ? `${String(report.updatedBy).split('@')[0]} · ` : ''}{timeAgo(report.updatedAt)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <IconButton icon="send" title="Send to email" onClick={() => { setSendFor(report); setSendTo([]); setSendExtra(''); setSendError(''); }} />
                <IconButton icon="pencil" title="Edit" onClick={() => setForm({ id: report.id, category: report.category, title: report.title, body: report.body, status: report.status })} />
                <IconButton icon="trash-2" title="Delete" onClick={() => setConfirmDelete(report)} />
              </div>
            </div>
          </div>
        ))}
      </TableShell>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete report "${confirmDelete?.title ?? ''}"?`}
        body="The report and its send history are removed. This cannot be undone."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          try { await deleteReport(confirmDelete.id); flash('Report deleted', '#f87171'); setConfirmDelete(null); await load(); }
          catch (err) { setError(String(err.message || err)); setConfirmDelete(null); }
        }}
      />
    </div>
  );
}
