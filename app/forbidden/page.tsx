// A page a role does not cover (the developer and debug layouts send people here). The shared status screen
// (2026-11-11); the button goes to the start, which the middleware turns into this person's own front door.
import StatusScreen from "@/components/portal/StatusScreen";

export const metadata = { title: "Not on your account" };

export default function ForbiddenPage() {
  return <StatusScreen kind="forbidden" tone="danger" eyebrow="Not on your account" title="This page is not open to your role" line="Your account does not cover it. Ask an admin if you need it for your work." action={{ label: "Go to the start", href: "/" }} />;
}
