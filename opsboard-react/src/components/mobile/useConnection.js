import { useEffect, useState } from 'react';
import { getConnectionState, subscribeConnectionState } from '../../services/wallStream';
import { buildApiUrl } from '../../services/timelineApi';

// Feed freshness for the phone/tablet views (design A5/B2): the SSE
// connection state PLUS a staleness judgement. "Alive" is the most recent of
// anything heard on the stream and the last successful timeline load (the
// 60s poll is real data too) — no data for > 3 minutes → STALE.
export const STALE_AFTER_MS = 3 * 60_000;

// LIVE also needs the Leon feed working (2026-11-03): a connected stream with hours-old Leon data read LIVE. The wall's
// public /api/health carries the feed's verdict and last run; read once a minute.
// The display never alarms because a CHECK failed: if the health route is slow, unreachable or answers badly, or the
// wall itself does not know yet (no Leon cycle since a restart), the chip keeps the stream's state and says the feed
// is unknown — never bad. Only a verdict the wall actually reports (partial, stale, failing) raises it.
const FEED_POLL_MS = 60_000;
const FEED_TIMEOUT_MS = 8_000;
const FROZEN = new Set(['stale', 'failing', 'not_set_up']);   // the board's data is not being refreshed
// 'partial': some operators sync, the rest do not — current for most, so not "frozen"; said on its own

export default function useConnection(dataUpdatedAt = 0) {
  const [conn, setConn] = useState(getConnectionState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feed, setFeed] = useState(null);
  useEffect(() => subscribeConnectionState(setConn), []);
  useEffect(() => {
    let off = false;
    const load = () => fetch(buildApiUrl('/api/health'), { cache: 'no-store', signal: AbortSignal.timeout(FEED_TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!off) setFeed(j?.leon?.verdict ? j.leon : null); })   // no usable answer: unknown, not the last verdict
      .catch(() => { if (!off) setFeed(null); });
    load(); const id = setInterval(load, FEED_POLL_MS);
    return () => { off = true; clearInterval(id); };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const lastAliveMs = Math.max(conn.lastHeardAt || 0, conn.lastDataAt || 0, dataUpdatedAt || 0);
  const streamStale = lastAliveMs > 0 && nowMs - lastAliveMs > STALE_AFTER_MS;
  // a feed verdict other than "working" (partial, stale, failing, unknown) is not LIVE; no verdict read = no claim
  const feedBad = FROZEN.has(feed?.verdict);
  const feedUnknown = !feed?.verdict || feed.verdict === 'unknown';
  const feedRunMs = feed?.lastRunAt ? Date.parse(feed.lastRunAt) : 0;
  const stale = streamStale || feedBad;
  const partial = !stale && feed?.verdict === 'partial';
  return {
    // 'connecting' | 'live' | 'reconnecting' | 'stale' | 'partial'
    status: stale ? 'stale' : partial ? 'partial' : conn.status,
    stale,
    partial,
    lastAliveMs,
    feed: feed?.verdict ?? null,
    feedUnknown,
    ageMin: streamStale
      ? (lastAliveMs > 0 ? Math.max(0, Math.floor((nowMs - lastAliveMs) / 60_000)) : 0)
      : feedRunMs > 0 ? Math.max(0, Math.floor((nowMs - feedRunMs) / 60_000)) : 0,
  };
}
