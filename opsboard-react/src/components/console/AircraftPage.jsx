import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteAircraft, fetchAircraftSchedule, setAircraftVisibility } from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import {
  Button,
  Dropdown,
  EmptyState,
  ErrorBanner,
  IconButton,
  LoadingState,
  PageHeader,
  SearchBox,
  t,
  TableShell,
  Toggle,
  useToast,
} from './ui';

// Aircraft — choose which tails render on the wall (approved design).

function fmtNext(row) {
  if (!row.nextFlightStart) return '—';
  const dt = new Date(row.nextFlightStart);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${dt.toISOString().slice(5, 10)} · ${dt.toISOString().slice(11, 16)}Z`;
}

export default function AircraftPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [deletingKey, setDeletingKey] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const savingKeyRef = useRef('');
  const bulkBusyRef = useRef(false);
  savingKeyRef.current = savingKey;
  bulkBusyRef.current = bulkBusy;
  const [search, setSearch] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const flash = useToast();

  async function load() {
    setError('');
    try {
      const payload = await fetchAircraftSchedule();
      setData(payload.aircraft || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Live-reconcile with toggles made by other console users; skip while a
    // local optimistic update is in flight (our own broadcast echoes back).
    return subscribeWallStream(
      'roster.changed',
      () => {
        if (!savingKeyRef.current && !bulkBusyRef.current) load();
      },
      { surface: 'console' }
    );
  }, []);

  const operatorOptions = useMemo(
    () => [
      { value: '', label: 'All operators' },
      ...[...new Set(data.map((row) => row.operatorName || row.oprId).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
    ],
    [data]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (operatorFilter && (row.operatorName || row.oprId) !== operatorFilter) return false;
      if (q && !`${row.registration} ${row.operatorName || ''} ${row.oprId || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, operatorFilter]);

  const shownCount = data.filter((row) => !row.isHidden).length;
  const hiddenCount = data.length - shownCount;

  async function toggle(row, showOnWall) {
    const key = `${row.oprId}:${row.registration}`;
    setSavingKey(key);
    setData((prev) =>
      prev.map((item) =>
        item.oprId === row.oprId && item.registration === row.registration ? { ...item, isHidden: !showOnWall } : item
      )
    );
    try {
      await setAircraftVisibility({ oprId: row.oprId, registration: row.registration, enabled: showOnWall });
      flash(showOnWall ? `Showing ${row.registration} on wall` : `Hidden ${row.registration} — lane removed`, showOnWall ? '#4ade80' : '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setSavingKey('');
    }
  }

  async function removeAircraft(row) {
    const key = `${row.oprId}:${row.registration}`;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete aircraft ${row.registration} (${row.operatorName || row.oprId})?\n\nIts cached flights are purged and its lane leaves the wall now. Because aircraft come from Leon, it stays hidden — if a later sync re-adds its flights they will not show on the wall until you re-enable it.`)) {
      return;
    }
    setDeletingKey(key);
    try {
      await deleteAircraft({ oprId: row.oprId, registration: row.registration });
      setData((prev) => prev.filter((item) => !(item.oprId === row.oprId && item.registration === row.registration)));
      flash(`Deleted ${row.registration}`, '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setDeletingKey('');
    }
  }

  async function setAll(showOnWall) {
    if (bulkBusy) return;
    setBulkBusy(true);
    const targets = visible.filter((row) => Boolean(row.isHidden) === showOnWall);
    setData((prev) =>
      prev.map((item) =>
        targets.some((row) => row.oprId === item.oprId && row.registration === item.registration)
          ? { ...item, isHidden: !showOnWall }
          : item
      )
    );
    try {
      for (const row of targets) {
        // Sequential on purpose — the visibility endpoint is one-row-at-a-time.
        await setAircraftVisibility({ oprId: row.oprId, registration: row.registration, enabled: showOnWall });
      }
      flash(showOnWall ? 'All aircraft shown on wall' : 'All aircraft hidden', showOnWall ? '#4ade80' : '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Aircraft"
        desc="Choose which aircraft appear on the wall. Hiding an aircraft removes its lane from the timeline immediately."
        descMax={600}
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchBox
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search registration or operator…"
          style={{ flex: 1, minWidth: 240 }}
        />
        <Dropdown icon="sliders-horizontal" label="Operator" value={operatorFilter} options={operatorOptions} onChange={setOperatorFilter} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: t.muted }}>
          <strong style={{ color: t.greenDeep }}>{shownCount}</strong> on wall ·{' '}
          <strong style={{ color: t.faint }}>{hiddenCount}</strong> hidden
        </span>
        <Button variant="softBlue" size="sm" disabled={bulkBusy} onClick={() => setAll(true)} style={{ height: 42 }}>
          Show all
        </Button>
        <Button variant="soft" size="sm" disabled={bulkBusy} onClick={() => setAll(false)} style={{ height: 42, color: t.muted }}>
          Hide all
        </Button>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      <TableShell
        columns="1fr 1.2fr 1.3fr 1.2fr .9fr"
        header={[
          { label: 'REGISTRATION' },
          { label: 'OPERATOR' },
          { label: 'UPCOMING (7 DAYS)' },
          { label: 'NEXT FLIGHT' },
          { label: 'SHOW ON WALL', align: 'right' },
        ]}
      >
        {loading && <LoadingState>Loading aircraft…</LoadingState>}
        {!loading && visible.length === 0 && (
          <EmptyState icon="navigation" title="No aircraft match">
            Adjust the search or operator filter.
          </EmptyState>
        )}
        {visible.map((row) => {
          const shown = !row.isHidden;
          return (
            <div
              key={`${row.oprId}:${row.registration}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.2fr 1.3fr 1.2fr .9fr',
                padding: '15px 18px',
                borderBottom: `1px solid ${t.rowLine}`,
                alignItems: 'center',
                background: shown ? '#fff' : t.subtle,
              }}
            >
              <div style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 600 }}>{row.registration}</div>
              <div style={{ fontSize: 14, color: t.body }}>{row.operatorName || row.oprId || '—'}</div>
              <div style={{ fontSize: 13.5, color: (row.flightCount ?? 0) > 0 ? t.body : t.faint }}>
                {(row.flightCount ?? 0) > 0 ? `${row.flightCount} upcoming` : 'No upcoming'}
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 13.5, color: row.nextFlightStart ? t.body : t.faint }}>{fmtNext(row)}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: shown ? t.greenDeep : t.faint }}>
                  {shown ? 'On wall' : 'Hidden'}
                </span>
                <Toggle
                  on={shown}
                  disabled={savingKey === `${row.oprId}:${row.registration}` || deletingKey === `${row.oprId}:${row.registration}` || bulkBusy}
                  onToggle={() => toggle(row, !shown)}
                />
                <IconButton
                  icon="trash-2"
                  title="Delete aircraft"
                  disabled={deletingKey === `${row.oprId}:${row.registration}`}
                  onClick={() => removeAircraft(row)}
                />
              </div>
            </div>
          );
        })}
      </TableShell>
    </div>
  );
}
