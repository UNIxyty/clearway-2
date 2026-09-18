import { useEffect, useState } from 'react';
import { getConnectionState, subscribeConnectionState } from '../../services/wallStream';

// Feed freshness for the phone/tablet views (design A5/B2): the SSE
// connection state PLUS a staleness judgement. "Alive" is the most recent of
// anything heard on the stream and the last successful timeline load (the
// 60s poll is real data too) — no data for > 3 minutes → STALE.
export const STALE_AFTER_MS = 3 * 60_000;

export default function useConnection(dataUpdatedAt = 0) {
  const [conn, setConn] = useState(getConnectionState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => subscribeConnectionState(setConn), []);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const lastAliveMs = Math.max(conn.lastHeardAt || 0, conn.lastDataAt || 0, dataUpdatedAt || 0);
  const stale = lastAliveMs > 0 && nowMs - lastAliveMs > STALE_AFTER_MS;
  return {
    // 'connecting' | 'live' | 'reconnecting' | 'stale'
    status: stale ? 'stale' : conn.status,
    stale,
    lastAliveMs,
    ageMin: lastAliveMs > 0 ? Math.max(0, Math.floor((nowMs - lastAliveMs) / 60_000)) : 0,
  };
}
