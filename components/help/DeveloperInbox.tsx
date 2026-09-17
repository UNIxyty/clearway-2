"use client";

import PortalShell from "@/components/portal/Shell";

// Phase 4 replaces this shell with the three-pane inbox (list groups, thread,
// quick actions, saved-replies popover, J/K/E/⌘⏎ shortcuts).
export default function DeveloperInbox() {
  return (
    <PortalShell crumb="Developer" title="Inbox" subtitle="Reports and chats from ops — every thread.">
      <div className="rounded-[13px] border border-cw-border bg-white p-6 text-[13.5px] text-cw-muted">
        Inbox is being wired up.
      </div>
    </PortalShell>
  );
}
