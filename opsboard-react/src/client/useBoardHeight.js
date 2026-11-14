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

// Where the Board's own parts sit inside the client's wrapper (v3, 2026-11-13): the width of its aircraft column and
// the height of its hour row, measured from the Board's header scroller. The desk lays its own "AIRCRAFT" word and the
// empty box by these numbers, so nothing of the client's look has to be written into the shared Board. Both are 0
// until the Board has drawn; the caller draws nothing by them then.
export function useBoardFrame(ref) {
  const [g, setG] = useState({ acW: 0, hourH: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const head = el.querySelector('.timeline-scroll--header');
      const row = head?.parentElement;
      if (!head || !row) { setG((cur) => (cur.acW || cur.hourH ? { acW: 0, hourH: 0 } : cur)); return; }
      const box = el.getBoundingClientRect();
      const acW = Math.max(0, Math.round(head.getBoundingClientRect().left - box.left));
      const hourH = Math.max(0, Math.round(row.getBoundingClientRect().bottom - box.top));
      setG((cur) => (cur.acW === acW && cur.hourH === hourH ? cur : { acW, hourH }));
    };
    const ro = new ResizeObserver(measure);
    let seen = null;
    // the header scroller changes size when the column or the hour row does: watch it once it exists
    const watch = () => { const head = el.querySelector('.timeline-scroll--header'); if (head && head !== seen) { if (seen) ro.unobserve(seen); seen = head; ro.observe(head); if (head.parentElement) ro.observe(head.parentElement); } measure(); };
    ro.observe(el);
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [ref]);
  return g;
}
