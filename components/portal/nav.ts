// ONE navigation registry for the whole platform shell (audit §4.3: nav data
// was duplicated in three diverged places). The portal sidebar renders from
// this; the console's deep-context nav mirrors the wall group (it is a
// separate Vite app — audit §7.3 — so it consumes the same STRUCTURE, kept
// in lockstep by this file being the single place the topology is defined).
//
// Phase 1 note: hrefs point at the routes that exist TODAY. Phase 2 (routing
// restructure) flips them to the new scheme here, in one place.

export type NavItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
  external?: boolean; // full navigation / new-tab (cross-app)
  deep?: "wall" | "debug" | "pickem"; // enters a deep context
};

export type NavTopic = {
  id: string;
  label: string;
  icon: string;
  roles: Array<"admin" | "user" | "guest">;
  href?: string; // topic itself navigates (Dashboard)
  items?: NavItem[];
};

export const NAV_TOPICS: NavTopic[] = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", roles: ["admin", "user"], href: "/dashboard" },
  {
    id: "aip",
    label: "AIP & Documents",
    icon: "file-text",
    roles: ["admin", "user"],
    items: [
      { id: "aip-search", label: "Airport search", icon: "search", href: "/aip" },
      { id: "aip-status", label: "Service status", icon: "activity", href: "/aip/service-status" },
    ],
  },
  {
    id: "wall",
    label: "Digital Wall",
    icon: "monitor",
    roles: ["admin", "user"],
    items: [
      { id: "wall-open", label: "Open wall", icon: "external-link", href: "/digital-wall/timeline/", external: true },
      { id: "wall-flights", label: "Flights", icon: "plane-takeoff", href: "/digital-wall/console/flights", external: true, deep: "wall" },
      { id: "wall-notam", label: "NOTAM Check", icon: "file-check", href: "/digital-wall/console/notam-check", external: true, deep: "wall" },
      { id: "wall-operators", label: "Operators", icon: "building-2", href: "/digital-wall/console/operators", external: true, deep: "wall" },
      { id: "wall-aircraft", label: "Aircraft", icon: "plane", href: "/digital-wall/console/aircraft", external: true, deep: "wall" },
      { id: "wall-limitations", label: "Limitations", icon: "triangle-alert", href: "/digital-wall/console/limitations", external: true, deep: "wall" },
      { id: "wall-important", label: "Important", icon: "megaphone", href: "/digital-wall/console/important", external: true, deep: "wall" },
      { id: "wall-caa", label: "CAA details", icon: "landmark", href: "/digital-wall/console/caa", external: true, deep: "wall" },
      { id: "wall-webhooks", label: "Webhooks", icon: "webhook", href: "/digital-wall/console/webhooks", external: true, deep: "wall" },
      { id: "wall-reports", label: "Reports", icon: "file-text", href: "/digital-wall/console/reports", external: true, deep: "wall" },
      { id: "wall-settings", label: "Settings", icon: "settings", href: "/digital-wall/console/settings", external: true, deep: "wall" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Issues",
    icon: "flag",
    roles: ["admin", "user"],
    items: [
      { id: "rep-bugs", label: "Bug reports", icon: "bug", href: "/admin/debug" }, // bug triage lives in the debug console today
      { id: "rep-console", label: "Console reports", icon: "clipboard-list", href: "/digital-wall/console/reports", external: true },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "shield",
    roles: ["admin"],
    items: [
      { id: "adm-users", label: "Users", icon: "users", href: "/admin/users" },
      { id: "adm-maint", label: "Maintenance", icon: "wrench", href: "/admin/maintenance" },
      { id: "adm-email", label: "Email tools", icon: "mail", href: "/admin/email-tools" },
      { id: "adm-logs", label: "Email logs", icon: "inbox", href: "/admin/email/logs" },
      { id: "adm-debug", label: "Debug runner", icon: "terminal", href: "/admin/debug", deep: "debug" },
      { id: "adm-status", label: "Service status editor", icon: "activity", href: "/admin/service-status" },
      { id: "adm-deleted", label: "Deleted airports", icon: "trash-2", href: "/admin/airports/deleted" },
    ],
  },
  {
    id: "pickem",
    label: "Pickem",
    icon: "trophy",
    roles: ["admin", "guest"],
    items: [
      { id: "pick-play", label: "Play", icon: "play", href: "/pickem", external: true },
      { id: "pick-admin", label: "Admin", icon: "sliders-horizontal", href: "/pickem/admin", external: true, deep: "pickem" },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: "user",
    roles: ["admin", "user", "guest"],
    items: [
      { id: "acc-profile", label: "Profile", icon: "user", href: "/account/profile" },
      { id: "acc-notify", label: "Notification settings", icon: "bell", href: "/account/notifications" },
      { id: "acc-stats", label: "Search statistics", icon: "chart-bar", href: "/account/search-stats" },
      { id: "acc-guide", label: "Guide", icon: "book-open", href: "/account/guide" },
      { id: "acc-signout", label: "Sign out", icon: "log-out", href: "/login" },
    ],
  },
];

// The reduced account dropdown = identity + exactly these five.
export const ACCOUNT_MENU_IDS = ["acc-profile", "acc-notify", "acc-stats", "acc-guide", "acc-signout"];

/** Per-airport deep-context sub-nav (Phase 2 makes these real routes). */
export const AIRPORT_DEEP_ITEMS = [
  { id: "ap-aip", label: "AIP documents", icon: "file-text", tab: "" },
  { id: "ap-gen", label: "GEN", icon: "book", tab: "gen" },
  { id: "ap-notam", label: "NOTAM", icon: "file-check", tab: "notam" },
  { id: "ap-wx", label: "Weather", icon: "cloud-sun", tab: "weather" },
] as const;

export type Role = "admin" | "user" | "guest";

export function topicsForRole(role: Role): NavTopic[] {
  return NAV_TOPICS.filter((t) => t.roles.includes(role));
}
