import { Hold } from "../_hold";
import { clientContactEmail } from "../contact";

export const metadata = { title: "Your access" };

export const dynamic = "force-dynamic";

export default async function ClientRemovedPage() {
  return (
    <Hold kind="client-removed" title="Your access has ended" line="This account no longer has access to flights. Write to the ops team from the address you signed up with if that should change." contact={await clientContactEmail()} />
  );
}
