import { Hold } from "../_hold";
import { clientContactEmail } from "../contact";

export const metadata = { title: "Your request" };

export const dynamic = "force-dynamic";

export default async function ClientRefusedPage() {
  return (
    <Hold kind="client-refused" title="Your request was not approved" line="Ops decided not to open access for this account. If you think that is a mistake, write to the ops team from the address you signed up with, or send a new request from the sign-in page." contact={await clientContactEmail()} />
  );
}
