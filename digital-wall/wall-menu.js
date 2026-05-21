(function () {
  if (window.__wallMenuInitialized) return;
  window.__wallMenuInitialized = true;

  const currentPath = location.pathname;
  const navItems = [
    { href: "/timeline", label: "Timeline" },
    { href: "/operators", label: "Operators" },
    { href: "/aircrafts", label: "Aircrafts" },
    { href: "/backend-test", label: "Backend Test" },
  ];

  const btn = document.createElement("button");
  btn.className = "wall-menu-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open navigation menu");
  btn.innerHTML = "☰";

  const overlay = document.createElement("div");
  overlay.className = "wall-menu-overlay";

  const panel = document.createElement("aside");
  panel.className = "wall-menu-panel";
  panel.innerHTML = `<h2>Digital Wall</h2><nav class="wall-menu-nav"></nav>`;
  const nav = panel.querySelector(".wall-menu-nav");

  for (const item of navItems) {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    if (currentPath === item.href || currentPath.startsWith(item.href + "/")) {
      link.classList.add("active");
    }
    nav.appendChild(link);
  }

  function openMenu() {
    overlay.classList.add("open");
    panel.classList.add("open");
  }

  function closeMenu() {
    overlay.classList.remove("open");
    panel.classList.remove("open");
  }

  btn.addEventListener("click", openMenu);
  overlay.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.body.appendChild(btn);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
})();
