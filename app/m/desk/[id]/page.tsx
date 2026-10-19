"use client";

// Tier 3 pages on the phone — Permissions, the debug runner, the component sheet — are one honest screen each
// (mobile-portal-spec.md › Tier 3): what the page is, why it needs room, a way back, and the link for a desk. The More
// sheet marks them Desk before anyone taps, so this screen should rarely be a surprise.
import { useParams } from "next/navigation";
import HonestScreen, { type Honest } from "@/components/m/HonestScreen";
import { MError } from "@/components/m/ui";

const DESK_PAGES: Record<string, Honest> = {
  permissions: { id: "permissions", icon: "key-round", name: "Permissions", what: "It’s a grid of every action against every role. On a phone it would be a table you can’t read or a list you can’t compare.", section: "Admin", back: "/m/users", desktop: "/admin/permissions" },
  debug: { id: "debug", icon: "bug", name: "The debug runner", what: "It runs jobs against live data and streams long logs side by side. That needs room to read before you press anything.", section: "Developer", back: "/m/inbox", desktop: "/admin/debug" },
  components: { id: "components", icon: "component", name: "The component sheet", what: "It shows every component at desktop sizes, in both themes, next to each other. Shrinking it would show nothing true.", section: "Developer", back: "/m/inbox", desktop: "/developer/components" },
};

export default function DeskPage() {
  const { id } = useParams<{ id: string }>();
  const p = DESK_PAGES[String(id)];
  if (!p) return <MError title="No such page" icon="monitor">The More tab lists every page.</MError>;
  return <HonestScreen p={p} />;
}
