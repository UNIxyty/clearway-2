// Our own dialog for the static tool pages (2026-11-09): never the browser's alert() or confirm(), which show the host
// name, ignore the page's look and, on a wall display, are a grey box in the middle of the screen.
//   cwDialog({ title, body, ok: "Reset", cancel: "Keep", danger: true }) → Promise<boolean>   (cancel: null = a notice)
// The keyboard: focus moves in (onto Cancel for a destructive one, so Enter never destroys by default), stays inside,
// Esc cancels, Enter presses the focused button, and focus returns to what opened it.
(function () {
  function cwDialog({ title, body = "", ok = "OK", cancel = "Cancel", danger = false } = {}) {
    return new Promise((resolve) => {
      const opener = document.activeElement;
      const scrim = document.createElement("div");
      scrim.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,14,24,.55)";
      const box = document.createElement("div");
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.style.cssText = "width:100%;max-width:440px;border-radius:14px;padding:20px 22px;background:var(--panel,var(--card,#fff));color:var(--text,#111);border:1px solid var(--border,#d6dbe4);box-shadow:0 18px 50px rgba(0,0,0,.35);font:inherit";
      const id = "cw-dialog-title-" + Date.now();
      box.setAttribute("aria-labelledby", id);
      const h = document.createElement("h2"); h.id = id; h.textContent = title; h.style.cssText = "margin:0 0 8px;font-size:17px;font-weight:700";
      const p = document.createElement("p"); p.textContent = body; p.style.cssText = "margin:0 0 18px;font-size:14px;line-height:1.5;opacity:.85";
      const row = document.createElement("div"); row.style.cssText = "display:flex;justify-content:flex-end;gap:10px";
      const mk = (label, primary) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label;
        b.style.cssText = "min-height:38px;padding:0 14px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer;" + (primary ? `border:none;color:#fff;background:${danger ? "#c62f3a" : "#2563eb"}` : "border:1px solid var(--border,#c9d0db);background:transparent;color:inherit");
        return b; };
      const okBtn = mk(ok, true); const cancelBtn = cancel === null ? null : mk(cancel, false);
      if (cancelBtn) row.appendChild(cancelBtn); row.appendChild(okBtn);
      box.append(h, p, row); scrim.appendChild(box); document.body.appendChild(scrim);
      const done = (v) => { document.removeEventListener("keydown", onKey, true); scrim.remove(); if (opener && opener.focus) opener.focus(); resolve(v); };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
        if (e.key === "Tab") { const f = [...box.querySelectorAll("button")]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
      };
      okBtn.addEventListener("click", () => done(true));
      if (cancelBtn) cancelBtn.addEventListener("click", () => done(false));
      scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) done(false); });
      document.addEventListener("keydown", onKey, true);
      (danger && cancelBtn ? cancelBtn : okBtn).focus();
    });
  }
  window.cwDialog = cwDialog;
})();
