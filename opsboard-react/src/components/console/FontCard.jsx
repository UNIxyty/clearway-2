import { useEffect, useMemo, useState } from 'react';
import { fetchDisplaySettings, saveDisplaySettings, fetchTimelineAircraft } from '../../services/timelineApi';
import { WALL_FONTS, DEFAULT_WALL_FONT_ID, DEFAULT_ZERO_STYLE, ZERO_STYLES, PLAIN_ZERO_WARNING, resolveWallFont, wallFontProbe, tabularDigits } from '../../theme/wallFont';
import { useWallColors } from '../../theme/WallColorsContext';
import { Button, Card, ErrorBanner, LoadingState, Segmented, t, useToast } from './ui';
import { errorText } from '../../services/errorText';
import FontPreview from '../wall-preview/FontPreview';

// Font tab — built like the Colours tab: the same per-account profile (My view / Main wall), the same
// GET/PUT /api/display/settings, the same config.changed route that repaints the wall in ~1-2 s, no reload.
// The wall's text font only: times, codes and callsigns are rendered in the same font on the wall today, so
// they follow it (every option has equal-width digits; the probe below says so per option).
//
// What actually renders is shown, not just what was picked: a live preview in the chosen font with text from
// the wall itself, and for the licensed options (Avenir / Helvetica / Arial) a measurement of whether the
// font is on THIS machine — a kiosk without it falls back, and this card says so plainly.

const PREVIEW_FALLBACK = { callsign: 'CWY101', route: 'EVRA → EGGW', reg: 'YL-CWY', time: '14:35Z', eta: '16:50Z', operator: 'Clearway Handling & Operations' };

export default function FontCard({ deviceId }) {
  const [fontId, setFontId] = useState(DEFAULT_WALL_FONT_ID);
  const [zeroStyle, setZeroStyle] = useState(DEFAULT_ZERO_STYLE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(PREVIEW_FALLBACK);
  const [probes, setProbes] = useState({});
  const flash = useToast();
  const colors = useWallColors();

  useEffect(() => {
    fetchDisplaySettings(deviceId)
      .then((payload) => { setFontId(resolveWallFont(payload.settings?.font).id); setZeroStyle(['dotted', 'slashed', 'plain'].includes(payload.settings?.zeroStyle) ? payload.settings.zeroStyle : DEFAULT_ZERO_STYLE); })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoaded(true));
  }, [deviceId]);

  // Preview text from the wall itself: the first flight on the timeline (never personal data: callsign, route,
  // registration, times, operator), with a fixed sample when the board is empty.
  useEffect(() => {
    fetchTimelineAircraft({ refresh: false })
      .then((payload) => {
        const row = (payload?.aircraft ?? []).find((a) => (a.flights ?? []).length);
        const f = row?.flights?.[0];
        if (!f) return;
        setSample({ callsign: f.fn || PREVIEW_FALLBACK.callsign, route: `${f.dep || '????'} → ${f.arr || '????'}`, reg: row.reg || PREVIEW_FALLBACK.reg, time: f.depHm ? `${f.depHm}Z` : PREVIEW_FALLBACK.time, eta: f.arrHm ? `${f.arrHm}Z` : PREVIEW_FALLBACK.eta, operator: row.type || PREVIEW_FALLBACK.operator });
      })
      .catch(() => {});
  }, []);

  // Which family will render on this machine, per option, and whether its digits are equal-width. Measured
  // after the self-hosted files have loaded, so a hosted font is not reported as missing while it downloads.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const out = {};
      for (const f0 of WALL_FONTS) { const f = resolveWallFont(f0.id, zeroStyle); out[f.id] = { ...wallFontProbe(f), tabular: await tabularDigits(f.stack) }; }
      if (!cancelled) setProbes(out);
    };
    run();
    return () => { cancelled = true; };
  }, [fontId, zeroStyle]);

  const chosen = useMemo(() => resolveWallFont(fontId, zeroStyle), [fontId, zeroStyle]);

  async function chooseZero(style) {
    if (style === zeroStyle) return;
    const previous = zeroStyle;
    setZeroStyle(style);
    try {
      await saveDisplaySettings({ zeroStyle: style }, deviceId);
      flash(`Zero → ${style} on Nunito, Roboto and Public Sans — wall updates in seconds`);
    } catch (err) { setZeroStyle(previous); setError(errorText(err)); }
  }

  async function choose(id) {
    if (id === fontId) return;
    const previous = fontId;
    setFontId(id);
    try {
      const payload = await saveDisplaySettings({ font: id }, deviceId);
      setFontId(resolveWallFont(payload.settings?.font).id);
      flash(`Wall font → ${resolveWallFont(id).label} — wall updates in seconds`);
    } catch (err) {
      setFontId(previous);
      setError(errorText(err));
    }
  }

  if (!loaded) return <Card><LoadingState>Loading the wall font…</LoadingState></Card>;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>Wall font</div>
          <div style={{ fontSize: 12.5, color: t.muted, marginTop: 3, maxWidth: 620, lineHeight: 1.5 }}>
            The text font of the wall display, per profile like the colours. The wall changes within seconds, no reload.
            The first seven are served from our own server with a zero that cannot be read as O — dotted (Nunito, Roboto, Public
            Sans) or the font’s own slash (Atkinson Hyperlegible Next, Inter, CW Slashed Sans P, CW Slashed Sans S). The last four have a
            plain zero: the old wall’s Nunito, and the commercial or system fonts the display machine has to supply — the notes
            under each say what this machine would actually render.
          </div>
        </div>
        <Button size="sm" variant="soft" disabled={fontId === DEFAULT_WALL_FONT_ID} onClick={() => choose(DEFAULT_WALL_FONT_ID)}>Reset to default</Button>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <FontPreview font={chosen} sample={sample} colors={colors} probe={probes[chosen.id]} />

      <div role="radiogroup" aria-label="Wall font" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '4px 2px 2px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>Zero on Nunito, Roboto and Public Sans</span>
          <Segmented value={zeroStyle} onChange={(v) => void chooseZero(v)} options={ZERO_STYLES} />
          <span style={{ fontSize: 12, color: t.muted, flexBasis: '100%' }}>At the wall’s label size a dot can fill in to a blob; a slash leaves two open triangles and survives small sizes better. The other fonts keep the zero they were designed with.</span>
        </div>
        {WALL_FONTS.map((f0) => {
          const f = resolveWallFont(f0.id, zeroStyle);
          const on = f.id === fontId; const p = probes[f.id];
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(f.id)}
              style={{ fontFamily: 'inherit', textAlign: 'left', display: 'grid', gridTemplateColumns: '18px 200px minmax(0,1fr)', gap: 14, alignItems: 'center', padding: '10px 14px', borderRadius: 12, cursor: 'pointer', background: on ? t.blueTint : t.card, border: `1.5px solid ${on ? t.blue : t.border}` }}
            >
              <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? t.blue : t.borderInput}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.blue }} />}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{f.label}{f.zeroVariants ? ` (${f.zero} zero)` : ''}{f.id === DEFAULT_WALL_FONT_ID ? <span style={{ fontWeight: 500, color: t.muted }}> · default</span> : null}</span>
                {f.note && <span style={{ fontSize: 11.5, color: t.muted }}>{f.note}</span>}
                <span style={{ fontSize: 11.5, color: t.faint, fontFamily: t.mono }}>{f.stack}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontFamily: f.stack, fontSize: 18, fontWeight: 700, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sample.callsign} {sample.route} {sample.time} 0O0O 0123456789</span>
                {!f.dottedZero && (
                  <span style={{ fontSize: 12, color: t.redDeep, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', padding: '1px 6px', borderRadius: 5, background: t.redTint, color: t.redDeep }}>PLAIN ZERO</span>
                    <span>{PLAIN_ZERO_WARNING}</span>
                  </span>
                )}
                {p && (
                  <span style={{ fontSize: 12, color: p.fallback ? t.amber : t.muted, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    {p.fallback && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', padding: '1px 6px', borderRadius: 5, background: t.amberTint, color: t.amber }}>FALLBACK</span>}
                    <span>{p.message}</span>
                    {p.tabular === false && <span style={{ color: t.redDeep }}>Digits are not all the same width in this font on this machine (a 1 is narrower), so the times under the now line can shift by a pixel as the clock ticks.</span>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: t.faint, marginTop: 12, lineHeight: 1.5 }}>
        Every option ends in a generic sans-serif, so a missing font never falls back to a serif. The measurement above is of
        <b> this </b>machine; the wall kiosk has its own fonts — a Linux kiosk has none of Avenir, Helvetica or Arial and renders the
        generic sans-serif (usually Liberation Sans or DejaVu Sans) for those two options.
      </div>
    </Card>
  );
}

