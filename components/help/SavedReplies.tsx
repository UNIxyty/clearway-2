"use client";

import PortalShell from "@/components/portal/Shell";

// Phase 4 replaces this shell with the saved-replies manager (text, paired
// status, honest use counts).
export default function SavedReplies() {
  return (
    <PortalShell crumb="Developer" title="Saved replies" subtitle="Canned replies, each optionally paired with a status change.">
      <div className="rounded-[13px] border border-cw-border bg-white p-6 text-[13.5px] text-cw-muted">
        Saved replies are being wired up.
      </div>
    </PortalShell>
  );
}
