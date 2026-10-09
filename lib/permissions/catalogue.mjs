// Every write action in the platform (portal, agent, intake, wall), and which write endpoint and agent tool needs which.
//
// Code says WHAT can be done; the database (public.permission_grants) says WHO may. This file is shared by the portal,
// the agent and the wall (each image copies lib/permissions/), so there is one list. Rules (docs/permissions.md):
//   - fail closed: no grant row, or grants that cannot be read, means no;
//   - an endpoint or tool that is not listed here is refused at runtime, and the startup / build check
//     (lib/permissions/check.mjs) fails while one exists;
//   - a NEW action has no grant row, so it shows in the grid switched off for everyone;
//   - DEFAULTS reproduce exactly what each endpoint allowed before permissions became data (Group 1), so seeding them
//     changes nothing. A later action's default stays "nobody" unless a migration says otherwise.

export const ROLES = ["user", "admin", "developer"];
export const ROLE_LABELS = { user: "User", admin: "Admin", developer: "Developer" };

// The permission that guards the permissions screen itself.
export const MANAGE = "permissions.manage";
// Grants nobody can remove, by any route: the developer role always manages permissions (the way back in).
export const PINNED = [["developer", MANAGE]];

const U = ["user", "admin", "developer"]; // everyone signed in
const A = ["admin", "developer"]; //          admin or developer (requireAdmin)
const D = ["developer"]; //                   developer only (requireDeveloper)

// Groups → actions. `hard`: shown to whoever grants it, before they do. `requires`: only effective for a role that also
// holds that action (stops a role that cannot manage permissions from making someone who can). `auto`: done by the
// software on the person's behalf (telemetry), listed so nothing is a silent gap.
export const GROUPS = [
  { key: "permissions", label: "Permissions", service: "portal", actions: [
    { key: MANAGE, label: "Manage permissions (this screen)", default: A, hard: "Whoever holds this can grant any other permission, to any role, including this one." },
  ] },
  { key: "users", label: "Users & access", service: "portal", actions: [
    { key: "portal.users.approve", label: "Approve or block new accounts", default: A },
    { key: "portal.users.set-admin", label: "Make someone an admin, or remove it", default: A, requires: MANAGE, hard: "An admin gets everything the Admin column holds. Only effective for a role that can also manage permissions; nobody can change their own." },
    { key: "portal.users.set-developer", label: "Make someone a developer, or remove it", default: D, requires: MANAGE, hard: "A developer can always manage permissions. Only effective for a role that can also manage permissions." },
    { key: "portal.agent.access", label: "Give or take away OPS agent access", default: D },
    { key: "portal.agent.killswitch", label: "Switch the OPS agent off or on for everyone", default: D, hard: "Switching it off stops the agent for every user at once." },
  ] },
  { key: "maintenance", label: "Maintenance", service: "portal", actions: [
    { key: "portal.maintenance.enable", label: "Turn maintenance on", default: D, hard: "Everyone except admins and developers is shown the maintenance page until it is turned off." },
    { key: "portal.maintenance.disable", label: "Turn maintenance off", default: A },
  ] },
  { key: "devtools", label: "Developer tools", service: "portal", actions: [
    { key: "portal.debug.run", label: "Start and stop debug runs", default: A },
    { key: "portal.aip.clear-cache", label: "Clear the stored AIP documents", default: A, hard: "Deletes every cached AIP PDF; each is downloaded again on next use, which is slow." },
    { key: "portal.service-status.edit", label: "Edit country service statuses", default: A },
  ] },
  { key: "aip", label: "AIP & documents", service: "portal", actions: [
    { key: "portal.aip.fetch", label: "Fetch AIP documents through the scrapers and test tools", default: U },
    { key: "portal.aip.stats", label: "Record AIP download timings", default: U, auto: true },
    { key: "portal.airports.hide", label: "Hide and restore airports (own list)", default: U },
  ] },
  { key: "bugs", label: "Bug reports", service: "portal", actions: [
    { key: "portal.bugs.file", label: "File bug reports, and withdraw your own", default: U },
    { key: "portal.bugs.triage", label: "Change a bug report's status", default: A },
    { key: "portal.bugs.delete", label: "Delete other people's bug reports", default: A, hard: "Deleted reports cannot be restored." },
  ] },
  { key: "help", label: "Help centre", service: "portal", actions: [
    { key: "portal.help.ask", label: "Open help threads and write in your own", default: U },
    { key: "portal.help.answer", label: "Answer, join and close other people's help threads", default: D },
    { key: "portal.help.saved-replies", label: "Manage saved replies", default: D },
  ] },
  { key: "account", label: "Account", service: "portal", actions: [
    { key: "portal.account.preferences", label: "Change your own preferences", default: U },
    { key: "portal.search.log", label: "Record your searches (Recents)", default: U, auto: true },
    { key: "portal.service-checks.recheck", label: "Re-run the service checks", default: U },
  ] },

  { key: "agent", label: "OPS agent", service: "agent", actions: [
    { key: "agent.chat", label: "Chat with the agent (and attach files, delete own conversations)", default: U },
    { key: "agent.voice", label: "Talk to the agent by voice", default: U },
    { key: "agent.settings.own", label: "Change your own agent settings", default: U },
    { key: "agent.settings.manage", label: "Change the agent's settings for everyone (models, capabilities, confirmations)", default: A },
    { key: "agent.email.send", label: "Have the agent send email", default: U },
    { key: "agent.files.generate", label: "Have the agent generate files", default: U },
    { key: "agent.manifest.generate", label: "Generate passenger manifests", default: U },
    { key: "agent.memory", label: "Have the agent remember and forget notes", default: U },
    { key: "agent.undo", label: "Undo an agent change (the change itself is checked again)", default: U },
    { key: "agent.extension.use", label: "Use the Chrome extension, and ask for a new site", default: U },
    { key: "agent.extension.sites", label: "Approve, add and revoke the extension's sites", default: A },
  ] },
  { key: "knowledge", label: "Knowledge base", service: "agent", actions: [
    { key: "agent.kb.upload", label: "Upload documents", default: D },
    { key: "agent.kb.edit", label: "Edit a document's record or replace its file", default: D },
    { key: "agent.kb.approve", label: "Approve or reject documents", default: D, hard: "An approved Tier 1 document is quoted to every user as the verbatim source." },
    { key: "agent.kb.see-others", label: "See other people's uploads that are not approved (pending, rejected, failed), and who uploaded them", default: D, read: true },
  ] },
  { key: "intake", label: "Flight intake", service: "agent", actions: [
    { key: "intake.requests.work", label: "Work on requests (edit, people, re-read, look up, Leon checks)", default: U },
    { key: "intake.requests.approve", label: "Approve or decline requests and cancellations", default: U },
    { key: "intake.send", label: "Send requests and passengers to Leon", default: U, hard: "Creates or cancels flights and passenger lists in Leon." },
    { key: "intake.people.reveal", label: "Reveal a passenger's personal data (logged)", default: A, read: true },
    { key: "intake.settings", label: "Change intake settings (mailbox readers, retention)", default: A },
    { key: "intake.mailbox.reveal", label: "Reveal personal data in the mailbox (mailbox readers only; logged)", default: U, read: true },
    { key: "intake.mailbox.act", label: "Act on mailbox messages (ignore, re-process, forward) — mailbox readers only", default: U },
  ] },

  { key: "operators", label: "Operators", service: "wall", actions: [
    { key: "wall.operators.create", label: "Add an operator", default: A },
    { key: "wall.operators.edit", label: "Edit an operator (name, prefix, Leon token, on/off)", default: A },
    { key: "wall.operators.delete", label: "Delete an operator", default: A, hard: "Takes its flights off the wall and stops its Leon sync. Re-adding needs the operator's Leon token again." },
  ] },
  { key: "aircraft", label: "Aircraft", service: "wall", actions: [
    { key: "wall.aircraft.visibility", label: "Show or hide aircraft on the wall", default: A },
    { key: "wall.aircraft.delete", label: "Delete an aircraft from the wall", default: A, hard: "Removes its flights from the wall now and keeps the tail hidden from later syncs." },
  ] },
  { key: "kiosks", label: "Kiosks & screens", service: "wall", actions: [
    { key: "wall.devices.approve", label: "Approve a kiosk screen", default: A, hard: "Gives that screen a long-lived key to the wall's flight data." },
    { key: "wall.devices.revoke", label: "Revoke a kiosk screen", default: A },
    { key: "wall.devices.edit", label: "Rename a screen", default: A },
    { key: "wall.devices.delete", label: "Delete a screen from the list", default: A },
  ] },
  { key: "bigscreen", label: "Big screen", service: "wall", actions: [
    { key: "wall.bigscreen.settings", label: "Change or reset the big screen's settings", default: A },
    { key: "wall.window", label: "Change the visibility window (every wall)", default: A },
    { key: "wall.clocks", label: "Change the wall clocks", default: A },
    { key: "wall.overlay", label: "Show or close a flight on the big screen", default: U },
  ] },
  { key: "myview", label: "My view", service: "wall", actions: [
    { key: "wall.myview", label: "Change or reset your own view (colours, fonts, sizing)", default: U },
    { key: "wall.env", label: "Report screen size (every wall and console)", default: U, auto: true },
  ] },
  { key: "flights", label: "Flights", service: "wall", actions: [
    { key: "wall.flights.check", label: "Mark a flight's IMP / NOTAM / WX / CAA as Checked", default: U },
    { key: "wall.flights.refresh", label: "Re-pull flights from Leon now", default: U },
    { key: "wall.aip.send", label: "Email an AIP / GEN document to yourself", default: U },
    { key: "wall.cache.weather", label: "Refresh all flights' weather", default: A },
    { key: "wall.cache.clear", label: "Clear the flight cache", default: A, hard: "Every wall loses its flights until the next Leon sync completes." },
  ] },
  { key: "webhooks", label: "Webhooks", service: "wall", actions: [
    { key: "wall.webhooks.toggle", label: "Switch a Leon webhook on or off", default: A },
    { key: "wall.webhooks.reregister", label: "Re-register the Leon webhooks", default: A },
    { key: "wall.webhooks.delete", label: "Delete a Leon webhook", default: A, hard: "Leon stops pushing changes; the wall falls back to polling until it is registered again." },
  ] },
  { key: "alerts", label: "Alerts", service: "wall", actions: [
    { key: "wall.alerts.rules", label: "Change the NOTAM / alert filter", default: A },
    { key: "wall.alerts.scan", label: "Run the alert scan now", default: A },
  ] },
  { key: "notam", label: "NOTAM", service: "wall", actions: [
    { key: "wall.notam.ack", label: "Acknowledge an airport's NOTAMs", default: U },
    { key: "wall.notam.resync", label: "Re-fetch one airport's NOTAMs", default: U },
    { key: "wall.notam.digest", label: "Change the daily NOTAM digest", default: A },
    { key: "wall.notam.run", label: "Run the NOTAM check now", default: A, hard: "Sends the daily notification email to everyone on its list." },
  ] },
  { key: "imp", label: "IMP", service: "wall", actions: [
    { key: "wall.imp.create", label: "Add IMP entries", default: A },
    { key: "wall.imp.edit", label: "Edit IMP entries (and review them)", default: A },
    { key: "wall.imp.attachments", label: "Add and remove IMP attachments", default: A },
    { key: "wall.imp.delete", label: "Delete IMP entries (to the bin)", default: A },
    { key: "wall.imp.restore", label: "Restore IMP entries from the bin", default: A },
    { key: "wall.imp.purge", label: "Empty IMP entries from the bin", default: A, hard: "Permanent: a purged entry cannot be restored." },
    { key: "wall.imp.reset-reviews", label: "Force a re-review of every IMP entry", default: A },
  ] },
  { key: "caa", label: "CAA details", service: "wall", actions: [
    { key: "wall.caa.create", label: "Add CAA entries", default: A },
    { key: "wall.caa.edit", label: "Edit CAA entries", default: A },
    { key: "wall.caa.delete", label: "Delete CAA entries", default: A, hard: "Permanent: CAA entries have no bin." },
  ] },
  { key: "limitations", label: "Limitations", service: "wall", actions: [
    { key: "wall.limitations.create", label: "Add limitations", default: A },
    { key: "wall.limitations.edit", label: "Edit limitations", default: A },
    { key: "wall.limitations.delete", label: "Delete limitations (to the bin)", default: A },
    { key: "wall.limitations.restore", label: "Restore limitations from the bin", default: A },
    { key: "wall.limitations.purge", label: "Empty limitations from the bin", default: A, hard: "Permanent: a purged limitation cannot be restored." },
  ] },
  { key: "reports", label: "Reports", service: "wall", actions: [
    { key: "wall.reports.create", label: "Raise a report", default: U },
    { key: "wall.reports.edit", label: "Update a report's status or text", default: U },
    { key: "wall.reports.send", label: "Email a report", default: U },
    { key: "wall.reports.config", label: "Edit report recipients and categories", default: A },
    { key: "wall.reports.delete", label: "Delete reports (to the bin)", default: A },
    { key: "wall.reports.restore", label: "Restore reports from the bin", default: A },
    { key: "wall.reports.purge", label: "Empty reports from the bin", default: A, hard: "Permanent: a purged report cannot be restored." },
  ] },
];

// Write endpoints → action. Portal routes are the app/api folder paths; agent and wall routes are written exactly as
// the code tests them: "/x" (===), "/x/*" (startsWith "/x/"), "re:^…$" (a regex on the path). `public` endpoints are not
// role-gated because there is no user: each checks its own signature or token, and says how. `any` lets the gate pass
// a request that needs one of several actions, and the handler then checks the precise one.
const P = (method, route, action) => ({ method, route, ...(typeof action === "string" ? { action } : action) });
export const ENDPOINTS = {
  portal: [
    P("POST", "/api/admin/users", { any: ["portal.users.approve", "portal.users.set-admin", "portal.users.set-developer"] }),
    P("POST", "/api/assistant/access", "portal.agent.access"),
    P("DELETE", "/api/assistant/access", "portal.agent.access"),
    P("PUT", "/api/assistant/kill-switch", "portal.agent.killswitch"),
    P("POST", "/api/admin/maintenance", { any: ["portal.maintenance.enable", "portal.maintenance.disable"] }),
    P("POST", "/api/admin/debug/runs", "portal.debug.run"),
    P("POST", "/api/admin/debug/runs/[id]", "portal.debug.run"),
    P("DELETE", "/api/admin/aip/clear-cache", "portal.aip.clear-cache"),
    P("POST", "/api/admin/country-service-status", "portal.service-status.edit"),
    P("POST", "/api/aip-meta-compare", "portal.aip.fetch"),
    P("POST", "/api/aip-test/download", "portal.aip.fetch"),
    P("POST", "/api/aip-test/extract", "portal.aip.fetch"),
    P("POST", "/api/rus-aip-test/download", "portal.aip.fetch"),
    P("POST", "/api/asecna/trigger-ad2", "portal.aip.fetch"),
    P("POST", "/api/textract-benchmark/run", "portal.aip.fetch"),
    P("POST", "/api/blocked-hitl-vnc", "portal.aip.fetch"),
    P("POST", "/api/lithuania-hitl-auto", "portal.aip.fetch"),
    P("POST", "/api/lithuania-hitl-test", "portal.aip.fetch"),
    P("POST", "/api/lithuania-hitl-vnc", "portal.aip.fetch"),
    P("POST", "/api/aip/download-stats", "portal.aip.stats"),
    P("POST", "/api/airports/delete", "portal.airports.hide"),
    P("POST", "/api/airports/restore", "portal.airports.hide"),
    P("POST", "/api/bug-reports", "portal.bugs.file"),
    P("PATCH", "/api/bug-reports/[id]", "portal.bugs.triage"),
    P("DELETE", "/api/bug-reports/[id]", { any: ["portal.bugs.file", "portal.bugs.delete"] }),
    P("POST", "/api/help/threads", "portal.help.ask"),
    P("PATCH", "/api/help/threads/[id]", "portal.help.answer"),
    P("POST", "/api/help/threads/[id]/messages", { any: ["portal.help.ask", "portal.help.answer"] }),
    P("POST", "/api/help/threads/[id]/presence", { any: ["portal.help.ask", "portal.help.answer"] }),
    P("POST", "/api/help/threads/[id]/read", { any: ["portal.help.ask", "portal.help.answer"] }),
    P("POST", "/api/help/attachments", "portal.help.ask"),
    P("PUT", "/api/help/drafts", "portal.help.ask"),
    P("DELETE", "/api/help/drafts", "portal.help.ask"),
    P("POST", "/api/help/saved-replies", "portal.help.saved-replies"),
    P("DELETE", "/api/help/saved-replies", "portal.help.saved-replies"),
    P("POST", "/api/user/preferences", "portal.account.preferences"),
    P("POST", "/api/search/log", "portal.search.log"),
    P("POST", "/api/service-checks/recheck", "portal.service-checks.recheck"),
    P("POST", "/api/admin/permissions", MANAGE),
    P("POST", "/api/auth/email/confirm", { public: "Confirms your own email address with Supabase Auth's one-time token." }),
    P("POST", "/api/auth/email/request-confirmation", { public: "Sends a confirmation link to an address; part of sign-up." }),
    P("POST", "/api/auth/password/forgot", { public: "Sends a password-reset link; part of signing in." }),
    P("POST", "/api/auth/password/reset", { public: "Sets a new password for the session Supabase Auth's reset link opened." }),
    P("POST", "/api/telegram/debug", { public: "Telegram's webhook: checked against the bot's secret header." }),
    P("POST", "/api/telegram/support", { public: "The Telegram mini app: checked against Telegram's signed initData." }),
    P("POST", "/auth/sign-out", { public: "Signs the caller out (ends their own session); nothing to permit." }),
  ],
  agent: [
    P("POST", "/api/intake/resend-webhook", { public: "Resend's inbound-mail webhook: checked by its Svix signature." }),
    P("POST", "/api/intake/answer", { public: "The one-tap answer page: the single-use token in the link is the authentication." }),
    P("POST", "/api/chat", "agent.chat"),
    P("POST", "/api/tools/invoke", "agent.chat"),
    P("POST", "re:^\\/api\\/confirmations\\/([0-9a-f-]{36})(?:\\/(confirm|cancel))?$", "agent.chat"),
    P("POST", "/api/attachments", "agent.chat"),
    P("POST", "/api/citations/check", "agent.chat"),
    P("POST", "/api/email/preview", "agent.chat"),
    P("DELETE", "re:^\\/api\\/conversations\\/[^/]+$", "agent.chat"),
    P("POST", "/api/voice/transcribe", "agent.voice"),
    P("POST", "/api/voice/activity", "agent.voice"),
    P("POST", "/api/voice/realtime-token", "agent.voice"),
    P("POST", "/api/voice/speak", "agent.voice"),
    P("PATCH", "/api/settings/me", "agent.settings.own"),
    P("PUT", "/api/settings/routing", "agent.settings.manage"),
    P("PUT", "/api/settings/skip-confirm-lock", "agent.settings.manage"),
    P("PATCH", "/api/settings", "agent.settings.manage"),
    P("POST", "/api/extension/token", "agent.extension.use"),
    P("POST", "/api/extension/token/refresh", "agent.extension.use"),
    P("POST", "/api/extension/resolve", "agent.extension.use"),
    P("POST", "/api/extension/insert-log", "agent.extension.use"),
    P("POST", "/api/extension/disconnect", "agent.extension.use"),
    P("POST", "/api/extension/sites/request", "agent.extension.use"),
    P("POST", "/api/extension/sites/decide", "agent.extension.sites"),
    P("POST", "/api/extension/sites/revoke", "agent.extension.sites"),
    P("POST", "/api/extension/sites/add", "agent.extension.sites"),
    P("POST", "/api/knowledge/documents", "agent.kb.upload"),
    P("PUT", "re:^\\/api\\/knowledge\\/documents\\/[^/]+\\/file$", "agent.kb.edit"),
    P("PATCH", "re:^\\/api\\/knowledge\\/documents\\/[^/]+$", "agent.kb.edit"),
    P("POST", "re:^\\/api\\/knowledge\\/documents\\/[^/]+\\/approve$", "agent.kb.approve"),
    P("POST", "re:^\\/api\\/knowledge\\/documents\\/[^/]+\\/reject$", "agent.kb.approve"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/lookup$", "intake.requests.work"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/edit$", "intake.requests.work"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/people\\/edit$", "intake.requests.work"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/reprocess$", "intake.requests.work"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/legs\\/(\\d+)\\/(check|not_in_leon)$", "intake.requests.work"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/(approve|decline)$", "intake.requests.approve"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/cancel-(approve|decline)$", "intake.requests.approve"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/prepare$", "intake.send"),
    P("POST", "re:^\\/api\\/intake\\/send\\/([0-9a-f-]{36})\\/(confirm|cancel)$", "intake.send"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/legs\\/(\\d+)\\/people\\/prepare$", "intake.send"),
    P("POST", "re:^\\/api\\/intake\\/people\\/([0-9a-f-]{36})\\/confirm$", "intake.send"),
    P("POST", "re:^\\/api\\/intake\\/requests\\/([0-9a-f-]{36})\\/people\\/reveal$", "intake.people.reveal"),
    P("PUT", "/api/intake/settings", "intake.settings"),
    P("POST", "re:^\\/api\\/mailbox\\/messages\\/([0-9a-f-]{36})\\/reveal$", "intake.mailbox.reveal"),
    P("POST", "re:^\\/api\\/mailbox\\/messages\\/([0-9a-f-]{36})\\/(ignore|unignore|reprocess|forward|process-handling|process-notification)$", "intake.mailbox.act"),
  ],
  wall: [
    P("POST", "/api/device/announce", { public: "An unregistered screen asking to be approved; it gets nothing until an admin approves it." }),
    P("POST", "/api/device/approve", "wall.devices.approve"),
    P("POST", "/api/device/revoke", "wall.devices.revoke"),
    P("PATCH", "/api/display/devices/*", "wall.devices.edit"),
    P("DELETE", "/api/display/devices/*", "wall.devices.delete"),
    // My view, or the big screen: the handler checks wall.bigscreen.settings / wall.window for the big screen's profile.
    P("PUT", "/api/display/settings", "wall.myview"),
    P("DELETE", "/api/display/settings/profile/*", "wall.myview"),
    P("POST", "/api/display/env", "wall.env"),
    P("PUT", "/api/display/clocks", "wall.clocks"),
    P("POST", "/api/display/overlay", "wall.overlay"),
    P("POST", "/api/operators", "wall.operators.create"),
    P("PATCH", "/api/operators/*", "wall.operators.edit"),
    P("DELETE", "/api/operators/*", "wall.operators.delete"),
    P("PUT", "/api/aircraft/visibility", "wall.aircraft.visibility"),
    P("DELETE", "/api/aircraft", "wall.aircraft.delete"),
    P("POST", "/api/flight-checks", "wall.flights.check"),
    P("POST", "/api/timeline/refresh", "wall.flights.refresh"),
    P("POST", "/api/aip/send", "wall.aip.send"),
    P("POST", "/api/admin/refresh-flight-weather", "wall.cache.weather"),
    P("POST", "/api/admin/clear-flight-cache", "wall.cache.clear"),
    P("POST", "/api/webhooks/toggle", "wall.webhooks.toggle"),
    P("POST", "/api/webhooks/reregister", "wall.webhooks.reregister"),
    P("DELETE", "/api/webhooks/*", "wall.webhooks.delete"),
    P("PUT", "/api/alerts/rules", "wall.alerts.rules"),
    P("POST", "/api/alerts/scan", "wall.alerts.scan"),
    P("POST", "/api/notam-check/ack", "wall.notam.ack"),
    P("POST", "/api/notam-check/resync", "wall.notam.resync"),
    P("PUT", "/api/notam-check/digest-config", "wall.notam.digest"),
    P("POST", "/api/notam-check/run", "wall.notam.run"),
    P("POST", "/api/important", "wall.imp.create"),
    P("PATCH", "/api/important/*", "wall.imp.edit"),
    P("DELETE", "/api/important/*", "wall.imp.delete"),
    P("POST", "re:^\\/api\\/important\\/[^/]+\\/restore$", "wall.imp.restore"),
    P("DELETE", "re:^\\/api\\/important\\/[^/]+\\/purge$", "wall.imp.purge"),
    P("POST", "re:^\\/api\\/important\\/([^/]+)\\/attachments(?:\\/([^/]+))?$", "wall.imp.attachments"),
    P("DELETE", "re:^\\/api\\/important\\/([^/]+)\\/attachments(?:\\/([^/]+))?$", "wall.imp.attachments"),
    P("POST", "/api/admin/reset-important-reviews", "wall.imp.reset-reviews"),
    P("POST", "/api/caa", "wall.caa.create"),
    P("PATCH", "/api/caa/*", "wall.caa.edit"),
    P("DELETE", "/api/caa/*", "wall.caa.delete"),
    P("POST", "/api/timeline/limitations", "wall.limitations.create"),
    P("PATCH", "/api/timeline/limitations/*", "wall.limitations.edit"),
    P("DELETE", "/api/timeline/limitations/*", "wall.limitations.delete"),
    P("POST", "re:^\\/api\\/timeline\\/limitations\\/[^/]+\\/restore$", "wall.limitations.restore"),
    P("DELETE", "re:^\\/api\\/timeline\\/limitations\\/[^/]+\\/purge$", "wall.limitations.purge"),
    P("POST", "/api/reports", "wall.reports.create"),
    P("PATCH", "/api/reports/*", "wall.reports.edit"),
    P("POST", "re:^\\/api\\/reports\\/[^/]+\\/send$", "wall.reports.send"),
    P("PUT", "/api/reports/config", "wall.reports.config"),
    P("DELETE", "/api/reports/*", "wall.reports.delete"),
    P("POST", "re:^\\/api\\/reports\\/[^/]+\\/restore$", "wall.reports.restore"),
    P("DELETE", "re:^\\/api\\/reports\\/[^/]+\\/purge$", "wall.reports.purge"),
  ],
};

// Every agent tool: the action it performs, or null for a read. A tool not in this map is refused (and fails the
// startup check). Tools that write through the wall name the wall's action, so the agent and the console agree.
export const AGENT_TOOLS = {
  show_flight_on_wall: "wall.overlay", close_flight_on_wall: "wall.overlay",
  create_limitation: "wall.limitations.create", update_limitation: "wall.limitations.edit",
  delete_limitation: "wall.limitations.delete", restore_limitation: "wall.limitations.restore", purge_deleted_limitation: "wall.limitations.purge",
  create_important: "wall.imp.create", delete_important: "wall.imp.delete", restore_important: "wall.imp.restore",
  create_report: "wall.reports.create", delete_report: "wall.reports.delete", restore_report: "wall.reports.restore",
  update_display_settings: "wall.myview", set_operator_active: "wall.operators.edit", set_aircraft_visible: "wall.aircraft.visibility",
  email_document: "agent.email.send", send_email: "agent.email.send", generate_file: "agent.files.generate",
  make_passenger_manifest: "agent.manifest.generate", remember: "agent.memory", forget: "agent.memory", undo_action: "agent.undo",
  // Reads.
  get_aip_document: null, get_gen_document: null, get_web_aip_link: null, get_aip_service_status: null, get_flight: null,
  get_flight_state: null, search_flights: null, find_flight: null, get_trip_legs: null, get_wall_state: null, get_notams: null,
  get_weather: null, get_notam_check_status: null, list_limitations: null, list_important: null, list_caa: null,
  list_operators: null, list_aircraft: null, get_webhook_states: null, get_webhook_history: null, list_reports: null,
  get_service_status: null, search_knowledge: null, get_document: null, list_files: null, search_manifest_flights: null,
  recall: null, web_search: null, get_flight_tracking: null, list_deleted_limitations: null, list_deleted_important: null,
  list_deleted_reports: null, list_recent_actions: null,
};

// ── Lookups ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const ACTIONS = new Map(GROUPS.flatMap((g) => g.actions.map((a) => [a.key, { ...a, group: g.key, groupLabel: g.label, service: g.service }])));

/** The catalogue's default grants: { role: Set(actions) }. */
export function defaultGrants() {
  const out = Object.fromEntries(ROLES.map((r) => [r, new Set()]));
  for (const a of ACTIONS.values()) for (const r of a.default ?? []) out[r]?.add(a.key);
  return out;
}

const routeMatchers = new Map();
function matcherFor(service, route) {
  const k = `${service} ${route}`;
  if (routeMatchers.has(k)) return routeMatchers.get(k);
  let m;
  if (route.startsWith("re:")) { const re = new RegExp(route.slice(3)); m = { kind: 2, test: (p) => re.test(p) }; }
  else if (service === "portal") {
    // app/api folder path: [x] is one segment.
    const re = new RegExp(`^${route.split("/").map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("/")}$`);
    m = { kind: route.includes("[") ? 2 : 1, test: (p) => re.test(p.replace(/\/+$/, "")) };
  } else if (route.endsWith("*")) { const pre = route.slice(0, -1); m = { kind: 3, len: pre.length, test: (p) => p.startsWith(pre) }; }
  else m = { kind: 1, test: (p) => p === route };
  routeMatchers.set(k, m);
  return m;
}

/**
 * The catalogue entry for a write request, or null (refuse). Exact routes win over patterns, patterns over prefixes,
 * longer prefixes over shorter ones — the order the services' own handlers test them in.
 */
export function endpointFor(service, method, pathname) {
  let best = null; let bestRank = null;
  for (const e of ENDPOINTS[service] ?? []) {
    if (e.method !== method) continue;
    const m = matcherFor(service, e.route);
    if (!m.test(pathname)) continue;
    const rank = [m.kind, -(m.len ?? 0)];
    if (!best || rank[0] < bestRank[0] || (rank[0] === bestRank[0] && rank[1] < bestRank[1])) { best = e; bestRank = rank; }
  }
  return best;
}

export const isWriteMethod = (m) => m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
