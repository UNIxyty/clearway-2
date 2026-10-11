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
  deep?: "wall" | "debug"; // enters a deep context
  // Sub-item gates (agent topic): admins-only and approvers-only rows. The
  // page behind each still enforces its own permission; this only hides.
  adminOnly?: boolean;
  approverOnly?: boolean;
  badge?: "kb-approvals" | "intake-attention" | "mailbox-attention"; // kb: awaiting approval (approvers only); intake/mailbox: Needs attention counts
  mailboxOnly?: boolean; // Agent mailbox: ops leads and intake admins only (the API enforces it; this only hides)
};

export type NavTopic = {
  id: string;
  label: string;
  icon: string;
  roles: Array<"admin" | "user" | "guest">;
  // Developer is a FLAG, not a role tier (help-centre gate): admin does NOT
  // see developer topics. Gated by the same flag as the routes and API scope.
  developerOnly?: boolean;
  // The agent is gated by a per-user ALLOWLIST resolved at runtime, not by any
  // role. A user without a grant must see no trace of it — so this topic is
  // omitted entirely rather than rendered disabled.
  agentOnly?: boolean;
  href?: string; // topic itself navigates (Dashboard)
  items?: NavItem[];
  keycap?: string; // shortcut shown at the right of the topic row (Ops Agent ⌘J)
};

// The nav is for the people who use the product. A page that exists only to help us build or debug (the debug runner,
// the component sheet) has no entry here: it has a URL, a role check, and a line in docs/portal-inventory.md saying
// it is reachable by URL on purpose.
export const NAV_TOPICS: NavTopic[] = [
  { id: "dashboard", label: "Dashboard", icon: "layout-grid", roles: ["admin", "user"], href: "/dashboard" },
  {
    id: "aip",
    label: "AIP & Documents",
    icon: "file-text",
    roles: ["admin", "user"],
    items: [
      { id: "aip-search", label: "Airport search", icon: "search", href: "/aip" },
      { id: "aip-status", label: "Service status", icon: "activity", href: "/aip/service-status" },
      // Everyone can hide an airport from their own search; this is where they get it back (it used to sit under Admin).
      { id: "aip-hidden", label: "Hidden airports", icon: "eye-off", href: "/admin/airports/deleted" },
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
    // Ops Agent (design spec §5): between Digital Wall and Reports & Issues.
    id: "agent",
    label: "Ops Agent",
    // Portal redesign §4: the bot icon in the shell (the panel itself keeps the Clearway ring mark as the agent's identity).
    icon: "bot",
    roles: ["admin", "user"], // roles don't matter here — agentOnly is the gate
    agentOnly: true,
    keycap: "⌘J",
    items: [
      { id: "agent-chat", label: "Chat", icon: "message-square", href: "/agent" },
      { id: "agent-history", label: "History", icon: "history", href: "/agent/history" },
      { id: "agent-knowledge", label: "Knowledge base", icon: "library", href: "/agent/knowledge", badge: "kb-approvals" },
      { id: "agent-intake", label: "Flight intake", icon: "plane-landing", href: "/agent/intake", badge: "intake-attention" },
      { id: "agent-mailbox", label: "Mailbox", icon: "mail", href: "/agent/mailbox", badge: "mailbox-attention", mailboxOnly: true },
      { id: "agent-activity", label: "Activity log", icon: "scroll-text", href: "/agent/activity" },
      { id: "agent-settings", label: "Settings", icon: "sliders-horizontal", href: "/agent/settings" }, // personal settings for everyone; organisation sections are admin-only inside the page
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "shield",
    roles: ["admin"],
    items: [
      { id: "adm-users", label: "Users", icon: "users", href: "/admin/users" },
      { id: "adm-agent-sites", label: "Agent sites", icon: "globe", href: "/admin/agent-sites" }, // Chrome extension site list: approve requests, add, revoke
      { id: "adm-perms", label: "Permissions", icon: "key-round", href: "/admin/permissions" }, // what each role may do (docs/permissions.md)
      { id: "adm-maint", label: "Maintenance", icon: "power", href: "/admin/maintenance" },
      { id: "adm-logs", label: "Email logs", icon: "inbox", href: "/admin/email/logs" },
      { id: "adm-status", label: "Service status editor", icon: "activity", href: "/admin/service-status" },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    icon: "terminal",
    roles: ["admin", "user"], // roles don't matter here — developerOnly is the gate
    developerOnly: true,
    items: [
      { id: "dev-inbox", label: "Inbox", icon: "inbox", href: "/developer/inbox" },
      { id: "dev-replies", label: "Saved replies", icon: "message-square", href: "/developer/saved-replies" },
      { id: "dev-agent", label: "Agent access", icon: "key", href: "/developer/agent-access" },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: "user",
    roles: ["admin", "user", "guest"],
    items: [
      { id: "acc-profile", label: "Profile", icon: "circle-user", href: "/account/profile" },
      { id: "acc-guide", label: "Guide", icon: "book-open", href: "/account/guide" },
      { id: "acc-signout", label: "Sign out", icon: "log-out", href: "/login" },
    ],
  },
  // Portal redesign stage 4: appearance, customisation and preferences — each person's own (§3.11). Last in the sidebar.
  { id: "settings", label: "Settings", icon: "settings", roles: ["admin", "user", "guest"], href: "/settings" },
];


export type Role = "admin" | "user" | "guest";

export function topicsForRole(role: Role, isDeveloper = false, hasAgent = false): NavTopic[] {
  return NAV_TOPICS.filter(
    (t) =>
      t.roles.includes(role) &&
      (!t.developerOnly || isDeveloper) &&
      // hasAgent defaults to false, so the agent is absent until proven
      // available — a failed probe never reveals it.
      (!t.agentOnly || hasAgent)
  );
}
