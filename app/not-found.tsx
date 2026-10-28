import PortalNotFound from "@/components/portal/PortalNotFound";

// Next answers an address no route knows with this page, and a real 404. Its element rides in the RSC payload of every
// page under the root layout — the sign-in page and a pending client's waiting screen included — so it is a client
// component with no props: the payload carries a reference to it, not its words or links (2026-10-28). Unknown /docs
// addresses no longer come here: the docs answer them with their own not-found (app/docs/[section]/[page]/[...rest]).
export default function NotFound() {
  return <PortalNotFound />;
}
