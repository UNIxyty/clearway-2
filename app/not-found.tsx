import { headers } from "next/headers";
import PortalNotFound from "@/components/portal/PortalNotFound";
import DocsNotFound from "@/app/docs/not-found";

// Next answers an address no route knows with this page, and a real 404 — including /docs/<anything unknown>. Its
// element also rides in the RSC payload of every page under the root layout: the sign-in page and a pending client's
// waiting screen included. So (2026-10-28) the docs' not-found, with its links (Help & support, the glossary, the
// portal), is rendered only for a request under /docs, and everywhere else the portal's own page is a client component
// with no props, so the payload carries a module reference and none of its words.
// x-cw-docs is set by middleware.ts on every request it lets through ("1" under /docs, "0" elsewhere), overwriting any
// copy a visitor sent. Absent — a request the middleware never saw — means the portal's page: closed by default.
export default function NotFound() {
  if (headers().get("x-cw-docs") !== "1") return <PortalNotFound />;
  return (
    <>
      {/* the docs' styles (app/docs/404.css/route.ts): not imported here, which would load them on every portal page */}
      <link rel="stylesheet" href="/docs/404.css" />
      <DocsNotFound />
    </>
  );
}
