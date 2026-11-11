// The client board's own height (2026-11-12, Dmitry's test): the wrapper around the shared Board is as tall as the
// rows it draws, so a row that holds two flights at once (a stacked lane) or an open flight never runs under the
// legend or the next card. The estimate (`fallback`, three rows at least) is the floor; the measured rows win when
// they are taller. The rows are measured by summing them (the board div itself stretches to its box, so its own
// height would only ever grow).
import { useLayoutEffect, useState } from 'react';

export function useBoardHeight(ref, fallback) {
  const [h, setH] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') { setH(fallback); return undefined; }
    const measure = () => {
      const rows = el.querySelector('[data-board-rows]');
      const body = el.querySelector('.timeline-scroll--body');
      if (!rows || !body) { setH(fallback); return; }
      const top = Math.round(body.getBoundingClientRect().top - el.getBoundingClientRect().top);
      const need = [...rows.children].reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
      setH(Math.max(fallback, top + Math.ceil(need) + 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const rows = el.querySelector('[data-board-rows]');
    if (rows) ro.observe(rows);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [ref, fallback]);
  return h;
}
