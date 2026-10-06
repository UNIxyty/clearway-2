// Flight-count check (bug report 7 follow-up item 2). Every sync cycle the backend counts Leon's flights in the
// wall's window against the wall's own and repairs what it can; this turns the result into ONE line for a person.
//   level 'error' — Leon and the wall still disagree after the repair, or the wall dropped flights it was sent
//   level 'warn'  — the count has not been verified recently (Leon unreachable / an operator in back-off)
//   level 'ok'    — counts agree (the console shows it; the wall stays quiet)
// The wall shows only 'warn' and 'error'; the console's Sync status card shows every level.

const hm = (iso) => (iso ? `${String(iso).slice(11, 16)}Z` : '');

function names(list = [], max = 4) {
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} +${list.length - max}` : shown;
}

/**
 * @param wc        the backend's windowCheck summary (null before the first cycle)
 * @param received  flights the wall was sent; drawn = flights it could draw (wall only)
 */
export function windowCheckLine(wc, { received = null, drawn = null } = {}) {
  if (received != null && drawn != null && drawn < received) {
    return { level: 'error', text: `Flight count: the wall was sent ${received} flights but could draw only ${drawn} — ${received - drawn} have no usable times.` };
  }
  if (!wc) return null;
  if (!wc.agree) {
    const parts = (wc.disagreeing || []).map((d) => {
      const bits = [];
      if (d.missing?.length) bits.push(`missing ${names(d.missing)}`);
      if (d.extra?.length) bits.push(`not in Leon ${names(d.extra)}`);
      return `${d.oprId}: ${bits.join('; ') || `${d.leon} vs ${d.wall}`}`;
    });
    return {
      level: 'error',
      text: `Flight count: Leon has ${wc.leon} flights in the wall's window, the wall shows ${wc.wall}${wc.disagreeSince ? ` (since ${hm(wc.disagreeSince)})` : ''} · ${parts.join(' · ')}`,
    };
  }
  if (Number(wc.ageMs) > 10 * 60 * 1000) {
    return { level: 'warn', text: `Flight count not verified since ${hm(wc.at)} — the wall may be missing changes from Leon.` };
  }
  if (wc.stale?.length) {
    return { level: 'warn', text: `Flight count not verified for ${wc.stale.join(', ')} — Leon not reachable for ${wc.stale.length === 1 ? 'that operator' : 'those operators'}.` };
  }
  return { level: 'ok', text: `Flight count: Leon ${wc.leon} · wall ${wc.wall} · checked ${hm(wc.at)}` };
}

/** The last cycle that found and repaired a difference — engineering detail for the console. */
export function windowRepairLine(wc) {
  const r = wc?.lastRepair;
  if (!r) return null;
  const ops = r.operators.map((o) => `${o.oprId} ${[o.missing && `${o.missing} missing`, o.extra && `${o.extra} extra`].filter(Boolean).join(', ')}`);
  return `Last repair ${hm(r.at)} ${String(r.at).slice(0, 10)}: ${ops.join(' · ')}`;
}
