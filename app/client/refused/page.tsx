import { Hold } from "../_hold";
import { clientContactEmail } from "../contact";

export const metadata = { title: "Your request" };

export default function ClientRefusedPage() {
  return (
    <Hold icon="—" title="Your request was not approved" contact={clientContactEmail()}>
      <p>Ops decided not to open access for this account. If you think that is a mistake, write to the ops team from the address you signed up with, or send a new request from the sign-in page.</p>
      <div className="cl-actions"><a className="cl-btn" href="/login">Back to sign in</a></div>
    </Hold>
  );
}
