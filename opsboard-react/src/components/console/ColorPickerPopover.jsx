import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from './ui';

// Custom colour picker for the Colours tab — console design language instead
// of the native OS dialog. Swatch button → portal popover (document.body,
// z-2400 so no card, map or overlay can clip it — the portal app's Leaflet
// lesson) with a saturation/value area, hue slider, mono hex field with an
// explicit invalid state, recently-used colours (localStorage) and a palette
// of the wall's current token colours. No alpha slider anywhere: tokens are
// #rrggbb by design — every translucent use derives via withAlpha in code,
// so a stored alpha would be dropped by the server's validation.

const RECENTS_KEY = 'console-colour-recents';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function loadRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => HEX_RE.test(v)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecent(hex) {
  try {
    const next = [hex, ...loadRecents().filter((v) => v !== hex)].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* private mode etc. */
  }
}

// ── HSV ⇄ hex ────────────────────────────────────────────────────────────────
function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }) {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  const rgb = [
    [v, u, p],
    [q, v, p],
    [p, v, u],
    [p, q, v],
    [u, p, v],
    [v, p, q],
  ][i];
  return `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

function Swatchlet({ hex, active, onPick, label }) {
  return (
    <button
      type="button"
      title={label ? `${label} · ${hex}` : hex}
      onClick={() => onPick(hex)}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: active ? `2px solid ${t.blue}` : '1px solid rgba(16,18,22,.18)',
        background: hex,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * The popover body. `value` is always a valid #rrggbb; `onChange` fires with
 * valid hexes only (live while dragging). `wallPalette` = [{hex,label}] of
 * the currently-resolved wall tokens (deduped by the caller).
 */
function PickerPopover({ anchorRect, value, onChange, onClose, wallPalette }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  const [recents] = useState(loadRecents);
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const boxRef = useRef(null);

  // Reposition: below the anchor, clamped into the viewport.
  const pos = useMemo(() => {
    const W = 268;
    const H = 372;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - W - 8));
    const below = anchorRect.bottom + 8;
    const top = below + H > window.innerHeight - 8 ? Math.max(8, anchorRect.top - H - 8) : below;
    return { left, top, W };
  }, [anchorRect]);

  const commit = useCallback(
    (nextHsv) => {
      setHsv(nextHsv);
      const hex = hsvToHex(nextHsv);
      setHexDraft(hex);
      onChange(hex);
    },
    [onChange]
  );

  // Drag handling shared by the SV area and the hue rail.
  const dragFrom = (ref, apply) => (event) => {
    event.preventDefault();
    const el = ref.current;
    if (!el) return;
    const move = (e) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      apply(x, y);
    };
    move(event);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const current = hsvToHex(hsv);
  const draftValid = HEX_RE.test(hexDraft.trim());

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Colour picker"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: pos.W,
        zIndex: 2400,
        background: '#fff',
        border: '1px solid #e6e7ea',
        borderRadius: 14,
        boxShadow: '0 16px 44px rgba(16,18,22,.18)',
        padding: 12,
        fontFamily: 'inherit',
      }}
    >
      {/* saturation / value area */}
      <div
        ref={svRef}
        onPointerDown={dragFrom(svRef, (x, y) => commit({ ...hsv, s: x, v: 1 - y }))}
        style={{
          position: 'relative',
          height: 148,
          borderRadius: 10,
          cursor: 'crosshair',
          background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hueHex})`,
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.35), 0 1px 4px rgba(0,0,0,.3)',
            transform: 'translate(-50%, -50%)',
            background: current,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* hue rail */}
      <div
        ref={hueRef}
        onPointerDown={dragFrom(hueRef, (x) => commit({ ...hsv, h: Math.min(x, 0.9999) }))}
        style={{
          position: 'relative',
          height: 14,
          borderRadius: 7,
          marginTop: 12,
          cursor: 'pointer',
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${hsv.h * 100}%`,
            top: '50%',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,.3)',
            transform: 'translate(-50%, -50%)',
            background: hueHex,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* hex field */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid rgba(16,18,22,.15)',
            background: current,
            flexShrink: 0,
          }}
        />
        <input
          value={hexDraft}
          onChange={(e) => {
            const next = e.target.value.trim();
            setHexDraft(next);
            if (HEX_RE.test(next)) {
              const hex = next.toLowerCase();
              setHsv(hexToHsv(hex));
              onChange(hex);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draftValid) onClose();
          }}
          spellCheck={false}
          aria-label="Hex value"
          aria-invalid={!draftValid}
          style={{
            flex: 1,
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 13,
            padding: '7px 10px',
            borderRadius: 8,
            outline: 'none',
            border: `1.5px solid ${draftValid ? '#d6d8dc' : t.red}`,
            background: draftValid ? '#fff' : t.redTint,
            color: draftValid ? '#17181c' : t.red,
          }}
        />
      </div>
      {!draftValid && (
        <div style={{ fontSize: 11.5, color: t.red, marginTop: 5 }}>
          Not a colour yet — needs the #rrggbb form, e.g. #2563eb
        </div>
      )}

      {recents.length > 0 && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: t.faint, margin: '12px 0 6px' }}>
            RECENTLY USED
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recents.map((hex) => (
              <Swatchlet key={hex} hex={hex} active={hex === current} onPick={(h) => { setHsv(hexToHsv(h)); setHexDraft(h); onChange(h); }} />
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: t.faint, margin: '12px 0 6px' }}>
        ON THE WALL NOW
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {wallPalette.map(({ hex, label }) => (
          <Swatchlet key={`${label}-${hex}`} hex={hex} label={label} active={hex === current} onPick={(h) => { setHsv(hexToHsv(h)); setHexDraft(h); onChange(h); }} />
        ))}
      </div>
    </div>,
    document.body
  );
}

/**
 * Swatch trigger + popover. onChange fires with VALID hex only; onCommitted
 * fires when the popover closes (for pushing recents once per session).
 */
export default function ColorPicker({ value, onChange, wallPalette, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const openedValueRef = useRef(value);

  const close = useCallback(() => {
    setOpen(false);
    if (openedValueRef.current !== value) pushRecent(value);
  }, [value]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          openedValueRef.current = value;
          setOpen((v) => !v);
        }}
        style={{
          width: 34,
          height: 26,
          borderRadius: 7,
          border: '1px solid rgba(16,18,22,.18)',
          boxShadow: 'inset 0 0 0 2px #fff',
          background: value,
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      />
      {open && btnRef.current && (
        <PickerPopover
          anchorRect={btnRef.current.getBoundingClientRect()}
          value={value}
          onChange={onChange}
          onClose={close}
          wallPalette={wallPalette}
        />
      )}
    </>
  );
}
