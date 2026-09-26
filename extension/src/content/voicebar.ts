// In-page voice bar + short-answer card (§E8, §4.23 adapted, F3.1–F3.4). Pure display: it is driven by
// `voicebar.state` messages and never touches the microphone or reads the page. Keys are captured only while
// the bar is up, and never from a page input except Esc.
import { createSurface, remove, ringMark, icon, keys, send, waveform, setWave, reducedMotion, escapeHtml, mmss, MONO } from "./surface";
import type { VoiceBarState } from "../shared/protocol";

declare global { interface Window { __cwVoiceBar?: { version: number } } }

const SURFACE = "cw-voicebar";
const CSS = `
.cw-vb { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.cw-bar { position: relative; height: 44px; border-radius: 999px; padding: 0 8px 0 14px; display: flex; align-items: center; gap: 12px; width: 420px; max-width: calc(100vw - 32px); overflow: hidden; }
.cw-bar.cw-error { background: #fdecec; color: #b91c1c; }
.cw-bar .cw-main { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; font-size: 14px; color: #17181c; }
.cw-bar .cw-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; justify-content: flex-start; white-space: nowrap; }
.cw-bar .cw-text.cw-tail-end { justify-content: flex-end; }
.cw-bar .cw-text > span { flex: none; }
.cw-bar .cw-muted { color: #9aa0a8; }
.cw-bar .cw-q { flex: 0 1 auto; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6c7079; font-size: 13.5px; }
.cw-bar .cw-div { width: 1px; height: 18px; background: #e6e7ea; flex: none; }
.cw-bar .cw-step { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; color: #17181c; }
.cw-bar .cw-right { flex: none; font-size: 11.5px; color: #9aa0a8; white-space: nowrap; padding-right: 6px; }
.cw-bar .cw-right .cw-key { font-size: 11.5px; }
.cw-bar .cw-timer { font-family: ${MONO}; font-size: 12px; color: #6c7079; }
.cw-bar .cw-err-title { font-weight: 600; color: #b91c1c; font-size: 13.5px; white-space: nowrap; }
.cw-bar .cw-err-detail { color: #b91c1c; opacity: .85; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cw-bar .cw-slide { position: absolute; bottom: 0; height: 2px; width: 33%; background: #2563eb; left: -33%; animation: cwSlide 1.2s linear infinite; }
.cw-card { width: 460px; max-width: calc(100vw - 32px); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.cw-card .cw-row { display: flex; align-items: center; gap: 10px; min-height: 24px; }
.cw-card .cw-status { font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #2563eb; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cw-card .cw-status.cw-ready { color: #6c7079; }
.cw-card .cw-sp { flex: 1; }
.cw-pill { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 4px 10px; background: #fff; color: #17181c; border: 1px solid #e6e7ea; }
.cw-pill:hover { background: #f5f6f8; }
.cw-pill .cw-key { color: #9aa0a8; font-size: 11px; }
.cw-pill.cw-stop { color: #b91c1c; background: #fdecec; border-color: #f7cfd0; }
.cw-pill.cw-stop:hover { background: #fbdede; }
.cw-card .cw-tr { font-size: 14px; line-height: 1.5; color: #17181c; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 40vh; overflow: auto; }
.cw-card .cw-tr .cw-unspoken { color: #b9bdc5; }
.cw-card .cw-foot { border-top: 1px solid #eef0f2; padding-top: 8px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6c7079; }
.cw-card .cw-src { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cw-card .cw-srcs { display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden; flex: 1; }
.cw-card .cw-link { background: transparent; color: #1d4ed8; font-weight: 600; font-size: 12px; padding: 2px 0; border-radius: 4px; }
.cw-card .cw-link .cw-key { color: #1d4ed8; opacity: .75; font-size: 11px; }
.cw-card .cw-needs { font-size: 13px; font-weight: 600; color: #1d4ed8; }
`;

(() => {
  if (window.__cwVoiceBar) return;
  window.__cwVoiceBar = { version: 1 };

  let bar: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let wrap: HTMLElement | null = null;
  let barWave: HTMLElement | null = null;
  let cardWave: HTMLElement | null = null;
  let current: VoiceBarState["state"] | null = null;
  let answerUp = false;
  let lastWaveAt = 0;
  let keysOn = false;

  const act = (action: string, extra?: Record<string, unknown>) => send({ type: "voicebar.action", action, ...(extra || {}) });

  const isTyping = (): boolean => {
    let a: Element | null = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    if (!a) return false;
    return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || (a as HTMLElement).isContentEditable;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!bar) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (answerUp) hideCard(); else act("discard");
      return;
    }
    if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); act("send"); }
    else if (e.key === "s" || e.key === "S") { e.preventDefault(); e.stopPropagation(); act("show"); }
    else if (e.key === "v" || e.key === "V") { e.preventDefault(); e.stopPropagation(); act("say"); }
  };
  const keysAttach = () => { if (!keysOn) { keysOn = true; window.addEventListener("keydown", onKey, true); } };
  const keysDetach = () => { if (keysOn) { keysOn = false; window.removeEventListener("keydown", onKey, true); } };

  function ensureBar(): HTMLElement {
    const s = createSurface(SURFACE, CSS);
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "cw-vb"; s.layer.appendChild(wrap); }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "cw-surface cw-bar cw-x7" + (reducedMotion() ? "" : " cw-x6");
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");
      wrap.insertBefore(bar, wrap.firstChild);
      keysAttach();
    }
    return bar;
  }

  function hideAll(): void {
    keysDetach();
    bar = card = wrap = barWave = cardWave = null;
    answerUp = false; current = null;
    remove(SURFACE);
  }
  function hideCard(): void {
    if (!card) return;
    const c = card; card = null; cardWave = null; answerUp = false;
    if (reducedMotion()) { c.remove(); return; }
    c.classList.remove("cw-x8"); c.classList.add("cw-x8out");
    setTimeout(() => c.remove(), 170);
  }

  const bands = (st: VoiceBarState, n: number): number[] | undefined => {
    if (!st.bands || !st.bands.length) return undefined;
    if (reducedMotion()) { const now = Date.now(); if (now - lastWaveAt < 250) return undefined; lastWaveAt = now; }
    return st.bands.slice(0, n);
  };

  function renderBar(st: VoiceBarState): void {
    const b = ensureBar();
    const same = current === st.state;
    b.classList.toggle("cw-error", st.state === "error");
    const bandsNow = bands(st, 10);
    if (!same) {
      current = st.state;
      b.innerHTML = "";
      b.insertAdjacentHTML("beforeend", ringMark(16));
      barWave = waveform(10, bandsNow, 3, 16);
      const main = document.createElement("div"); main.className = "cw-main";
      const right = document.createElement("div"); right.className = "cw-right";
      if (st.state === "invoked" || st.state === "listening") {
        b.appendChild(barWave); b.appendChild(main); b.appendChild(right);
        main.innerHTML = `<div class="cw-text"><span></span></div>`;
      } else if (st.state === "processing" || st.state === "answer") {
        b.appendChild(barWave); b.appendChild(main); b.appendChild(right);
        main.innerHTML = `<span class="cw-q"></span><span class="cw-div"></span><span class="cw-step"></span>`;
        if (st.state === "processing") { const sl = document.createElement("span"); sl.className = "cw-slide"; b.appendChild(sl); }
      } else if (st.state === "error") {
        b.appendChild(main); b.appendChild(right);
        main.innerHTML = `${icon("triangle-alert", 16, "#b91c1c")}<span class="cw-err-title"></span><span class="cw-err-detail"></span>`;
      }
    } else if (barWave && bandsNow) setWave(barWave, bandsNow, 3, 16);
    else if (barWave && !st.bands) setWave(barWave, undefined, 3, 16);

    const main = b.querySelector(".cw-main") as HTMLElement;
    const right = b.querySelector(".cw-right") as HTMLElement;
    switch (st.state) {
      case "invoked": {
        b.style.width = "420px";
        const t = main.querySelector(".cw-text") as HTMLElement;
        t.classList.remove("cw-tail-end");
        t.innerHTML = `<span class="cw-muted">Listening…</span>`;
        right.innerHTML = `${keys("⌥⇧Space")} to send <span class="cw-sep">·</span> ${keys("Esc")}`;
        break;
      }
      case "listening": {
        const text = st.text || "", tail = st.tail || "";
        const n = (text + tail).length;
        b.style.width = `${Math.min(560, Math.max(420, 420 + Math.max(0, n - 20) * 4))}px`;
        const t = main.querySelector(".cw-text") as HTMLElement;
        t.classList.toggle("cw-tail-end", n > 0);
        t.innerHTML = n ? `<span>${escapeHtml(text)}${tail ? `<span class="cw-muted">${escapeHtml((text && !/\s$/.test(text) ? " " : "") + tail)}</span>` : ""}</span>` : `<span class="cw-muted">Listening…</span>`;
        right.innerHTML = `<span class="cw-timer">${mmss(st.seconds)}</span>`;
        break;
      }
      case "processing":
      case "answer": {
        b.style.width = "540px";
        (main.querySelector(".cw-q") as HTMLElement).textContent = st.text ? `“${st.text}”` : "";
        const step = main.querySelector(".cw-step") as HTMLElement;
        step.textContent = st.state === "processing" ? (st.step || "Working…") : (st.step || "Answer");
        (main.querySelector(".cw-div") as HTMLElement).style.display = st.text ? "" : "none";
        right.innerHTML = `${keys("Esc")}`;
        break;
      }
      case "error": {
        b.style.width = "540px";
        (main.querySelector(".cw-err-title") as HTMLElement).textContent = st.error?.title || "Voice didn't work";
        (main.querySelector(".cw-err-detail") as HTMLElement).textContent = st.error?.detail || "";
        right.innerHTML = `Type instead <span class="cw-sep">·</span> ${keys("⌥⇧C")}`;
        right.style.color = "#6c7079";
        break;
      }
    }
  }

  function renderCard(st: VoiceBarState): void {
    const a = st.answer;
    if (!a) { hideCard(); return; }
    ensureBar();
    const fresh = !card;
    if (!card) {
      card = document.createElement("div");
      card.className = "cw-surface cw-card" + (reducedMotion() ? "" : " cw-x8");
      card.setAttribute("role", "region");
      card.setAttribute("aria-label", "Clearway answer");
      wrap!.appendChild(card);
      answerUp = true;
    }
    const c = card;
    const status = a.needsPanel ? "READY" : a.speaking ? `SPEAKING · ${mmss(a.time)} / ${mmss(a.duration)}` : "READY";
    if (fresh) {
      c.innerHTML = "";
      const row = document.createElement("div"); row.className = "cw-row";
      cardWave = waveform(7, bands(st, 7), 3, 14);
      row.appendChild(cardWave);
      row.insertAdjacentHTML("beforeend", `<span class="cw-status"></span><span class="cw-sp"></span>` +
        (a.needsPanel ? "" : `<button type="button" class="cw-btn cw-pill cw-show">Show instead ${keys("S")}</button><button type="button" class="cw-btn cw-pill cw-stop">Stop</button>`));
      c.appendChild(row);
      const tr = document.createElement("div"); tr.className = "cw-tr"; c.appendChild(tr);
      const foot = document.createElement("div"); foot.className = "cw-foot";
      foot.innerHTML = `<span class="cw-srcs"></span>` + (a.needsPanel
        ? `<button type="button" class="cw-btn cw-link cw-open cw-needs">Needs the panel <span class="cw-sep">·</span> ${keys("⌥⇧C")}</button>`
        : `<button type="button" class="cw-btn cw-link cw-open">Open in panel ${keys("⌥⇧C")}</button>`);
      c.appendChild(foot);
      c.querySelector(".cw-show")?.addEventListener("click", (e) => { e.preventDefault(); act("show"); });
      c.querySelector(".cw-stop")?.addEventListener("click", (e) => { e.preventDefault(); act("stop"); });
      c.querySelector(".cw-open")?.addEventListener("click", (e) => { e.preventDefault(); act("openPanel"); });
    } else if (cardWave) {
      const bn = bands(st, 7); if (bn) setWave(cardWave, bn, 3, 14); else if (!a.speaking) setWave(cardWave, undefined, 3, 14);
    }
    const stEl = c.querySelector(".cw-status") as HTMLElement;
    stEl.textContent = status;
    stEl.classList.toggle("cw-ready", !a.speaking || a.needsPanel);
    const stop = c.querySelector(".cw-stop") as HTMLElement | null;
    if (stop) stop.style.display = a.speaking ? "" : "none";
    if (cardWave) cardWave.style.display = a.speaking ? "" : "none";
    const tr = c.querySelector(".cw-tr") as HTMLElement;
    const text = a.text || "";
    const n = Math.max(0, Math.min(text.length, a.needsPanel ? text.length : a.spokenChars | 0));
    tr.innerHTML = `<span>${escapeHtml(text.slice(0, n))}</span><span class="cw-unspoken">${escapeHtml(text.slice(n))}</span>`;
    tr.style.display = text ? "" : "none";
    const srcs = c.querySelector(".cw-srcs") as HTMLElement;
    srcs.innerHTML = (a.sources || []).slice(0, 4).map((sname) => `<span class="cw-src">${icon(sname.icon === "database" ? "database" : "globe", 12, "#9aa0a8")}<span>${escapeHtml(sname.name)}</span></span>`).join("");
  }

  function apply(st: VoiceBarState): void {
    if (!st || st.state === "hidden") { hideAll(); return; }
    renderBar(st);
    if (st.state === "answer") renderCard(st); else hideCard();
  }

  chrome.runtime.onMessage.addListener((msg: { type?: string } & Partial<VoiceBarState>) => {
    if (!msg || msg.type !== "voicebar.state") return;
    apply(msg as unknown as VoiceBarState);
  });
})();
