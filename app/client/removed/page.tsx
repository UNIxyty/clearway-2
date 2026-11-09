import { Hold } from "../_hold";
import { clientContactEmail } from "../contact";

export const metadata = { title: "Your access" };

export const dynamic = "force-dynamic";

export default async function ClientRemovedPage() {
  return (
    <Hold icon="—" title="Your access has ended" contact={await clientContactEmail()}>
      <p>This account no longer has access to flights. Write to the ops team from the address you signed up with if that should change.</p>
      <div className="cl-actions"><a className="cl-btn" href="/login">Back to sign in</a></div>
    </Hold>
  );
}
