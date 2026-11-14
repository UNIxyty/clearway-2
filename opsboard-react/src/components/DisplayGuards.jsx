import { useEffect, useRef, useState } from 'react';
import ErrorBoundary, { PartFailed } from './ErrorBoundary';
import Board from './Board';
import { WALL_FONT } from '../theme/wallFont';

// The ops room display must never go blank from one error, and nobody stands next to it to tap "Reload"
// (2026-11-13). Every part of the display sits in its own boundary (components/ErrorBoundary.jsx) that tries again on
// its own — after 5 s, 15 s, 60 s, then every 60 s — and the timeline, the one part the room cannot do without, also
// keeps its LAST GOOD picture on screen while it is failing, under a "NOT LIVE" mark.
//
// With no error none of this draws anything: a boundary, the probe inside it and <Rendered> all render nothing, so the
// display's elements and styles are exactly what they were. The fallbacks and the mark exist only while a part is
// failing.

/** A display part in its boundary. `fallbackStyle` places the small message where the part was. */
export function WallPart({ where, resetKey, fallbackStyle, children }) {
  return (
    <ErrorBoundary where={where} resetKey={resetKey} autoRetry fallback={(retry) => <WallPartFailed onRetry={retry} style={fallbackStyle} />}>
      {children}
    </ErrorBoundary>
  );
}

/** The small message, in the display's own notice colours (the wall has no inherited text colour to lean on). */
export function WallPartFailed({ onRetry, style, part = '' }) {
  return (
    <div data-wall-part-failed={part} style={{ ...g.failed, ...style }}>
      <PartFailed compact onRetry={onRetry} />
    </div>
  );
}

// Renders nothing. Its effect runs only when the parts drawn before it in the same boundary made it to the screen, so
// it is the "this picture was good" signal.
function Rendered({ then }) {
  useEffect(() => { then(); });
  return null;
}

/**
 * The timeline. Takes Board's props exactly as DisplayApp gives them.
 *   · every picture that reaches the screen is remembered (the props it was drawn from, and when)
 *   · when Board throws, the boundary shows <HeldTimeline>: Board again, drawn from the last good props, and the mark
 *   · the boundary tries the live props again on its own (autoRetry); the first try that draws replaces the held
 *     picture and the mark goes with it
 *   · if the held picture fails too, the timeline's area shows the small message; the tries go on, the rest of the
 *     display stays
 */
export default function BoardGuard(props) {
  // now: the last picture that reached the screen · before: the one before it. Each is { props, at }.
  // A picture that drew and then failed (an error in an effect) is still "now"; the held timeline then finds that it
  // fails and moves on to "before" (HeldTimeline below), on every try.
  const good = useRef({ now: null, before: null });
  // Until the first failure the timeline is <Board> with DisplayApp's props and nothing else, as it always was.
  const [failedBefore, setFailedBefore] = useState(false);
  return (
    <ErrorBoundary where="display/timeline" autoRetry onError={() => setFailedBefore(true)}
      fallback={(retry) => <HeldTimeline good={good} onRetry={retry} />}>
      {failedBefore ? <BoardAgain {...props} /> : <Board {...props} />}
      <Rendered then={() => {
        const g = good.current;
        if (!g.now || g.now.props !== props) { g.before = g.now; g.now = { props, at: Date.now() }; } else g.now.at = Date.now();
      }} />
    </ErrorBoundary>
  );
}

// A Board mounted on a page that is already running (the held picture, and the live timeline on a new try): its props
// do not change after it mounts, so it centres on "now" once, before it has measured its own width, and would sit
// hours off until its idle return 10 s later. Asked for "now" through its own scrollToMs prop during its first
// seconds, it centres again as soon as it has measured. After that the prop is null, which is Board's default.
function BoardAgain(props) {
  const [aim, setAim] = useState(() => Date.now());
  useEffect(() => { const id = setTimeout(() => setAim(null), 3000); return () => clearTimeout(id); }, []);
  return <Board {...props} scrollToMs={aim} />;
}

// Shown only while the live timeline is failing. The pictures to fall back on are fixed when this mounts: the last
// one that reached the screen, then the one before it, tried in that order.
// Named display/held-timeline, not display/timeline/…, so the test's flag for the live timeline does not also break
// the held one.
function HeldTimeline({ good, onRetry }) {
  const [shots] = useState(() => [good.current.now, good.current.before].filter(Boolean));
  const [pick, setPick] = useState(0);
  const shot = shots[pick];
  return (
    <>
      {shot ? (
        <ErrorBoundary key={pick} where="display/held-timeline" fallback={null} onError={() => setPick((n) => n + 1)}>
          <BoardAgain {...shot.props} />
        </ErrorBoundary>
      ) : (
        <div data-timeline-down="" style={g.timelineDown}>
          <WallPartFailed part="timeline" onRetry={onRetry} style={{ alignSelf: 'center' }} />
        </div>
      )}
      <div data-not-live="" role="status" style={g.notLive}>
        {shot ? `NOT LIVE · since ${utcClock(shot.at)}` : 'NOT LIVE'}
      </div>
    </>
  );
}

function utcClock(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

const g = {
  // the display's corner-notice look (DisplayApp's s.notice + s.noticeError), as a block where the part was
  failed: {
    flex: '0 0 auto', alignSelf: 'flex-start', margin: 6, maxWidth: 420,
    color: '#ef9a9a', background: 'rgba(21,26,39,.92)', borderRadius: 8, fontFamily: WALL_FONT,
  },
  // the timeline's own area, kept so the row beside it does not move
  timelineDown: { display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // the display's warning-line look (DisplayApp's s.countLine + s.countLineWarn: read from across the room), in the
  // right corner one line above the corner notices so the two never cover each other
  notLive: {
    position: 'fixed', right: 12, bottom: 44, zIndex: 210, maxWidth: '62vw',
    fontFamily: WALL_FONT, fontSize: 16, fontWeight: 700, lineHeight: 1.3, borderRadius: 6, padding: '6px 12px',
    border: '2px solid', color: '#1a1300', background: 'rgba(240,180,40,.95)', borderColor: '#ffd36a',
  },
};
