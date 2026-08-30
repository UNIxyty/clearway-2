// Legacy alias — the service-status board moved under the AIP topic
// (audit §5.2: /status → /aip/service-status). Old bookmarks and the nav
// registry keep working through this redirect.

import { redirect } from "next/navigation";

export default function StatusPage() {
  redirect("/aip/service-status");
}
