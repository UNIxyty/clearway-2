// What a client gets for any address outside their world, and what staff get under /client (Stage 5). The segment's
// not-found: the middleware rewrites to /client/gone, whose page calls notFound(), so the status is a real 404 and the
// body is this, under the client layout (never the portal's root not-found, whose payload carries the docs). Since
// 2026-11-11 the shared status screen; the button goes to the start, which the middleware turns into the client's own
// start page (Timeline or Flights, as they chose) and into the staff start page for staff.
import StatusScreen from "@/components/portal/StatusScreen";

export default function ClientNotFound() {
  return (
    <main data-client-notfound="">
      <StatusScreen kind="client-not-found" eyebrow="Not on your account" title="That is not on your account" line="If you reached this from a link, the flight or page is not one your account covers." action={{ label: "Your flights", href: "/" }} />
    </main>
  );
}
