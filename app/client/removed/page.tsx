import { Hold } from "../_hold";

export const metadata = { title: "Your access" };

export default function ClientRemovedPage() {
  return (
    <Hold icon="—" title="Your access has ended">
      <p>This account no longer has access to flights. Write to the ops team from the address you signed up with if that should change.</p>
      <div className="cl-actions"><a className="cl-btn" href="/login">Back to sign in</a></div>
    </Hold>
  );
}
