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
const FEED_POLL_MS = 60_000;

export default function useConnection(dataUpdatedAt = 0) {
  const [conn, setConn] = useState(getConnectionState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feed, setFeed] = useState(null);
  useEffect(() => subscribeConnectionState(setConn), []);
  useEffect(() => {
    let off = false;
    const load = () => fetch(buildApiUrl('/api/health'), { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!off) setFeed(j?.leon ?? null); }).catch(() => { if (!off) setFeed(null); });
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
  const feedBad = Boolean(feed?.verdict) && feed.verdict !== 'working';
  const feedRunMs = feed?.lastRunAt ? Date.parse(feed.lastRunAt) : 0;
  const stale = streamStale || feedBad;
  return {
    // 'connecting' | 'live' | 'reconnecting' | 'stale'
    status: stale ? 'stale' : conn.status,
    stale,
    lastAliveMs,
    feed: feed?.verdict ?? null,
    ageMin: streamStale
      ? (lastAliveMs > 0 ? Math.max(0, Math.floor((nowMs - lastAliveMs) / 60_000)) : 0)
      : feedRunMs > 0 ? Math.max(0, Math.floor((nowMs - feedRunMs) / 60_000)) : 0,
  };
}
