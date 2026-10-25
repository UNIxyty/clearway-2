import { Hold } from "../_hold";

export const metadata = { title: "Your request" };

// The waiting screen (Stage 5). Three steps, the third current. No promise of a time: "You will get an email when it is
// decided." (decided 2026-10-20). The middleware brings every not-yet-approved client here and nowhere else.
export default function ClientWaitingPage() {
  return (
    <Hold icon="…" title="Your request is with ops">
      <ol className="cl-steps">
        <li><span className="dot done">✓</span>Request sent</li>
        <li><span className="dot done">✓</span>Email confirmed</li>
        <li><span className="dot now" aria-current="step"></span>Checked by ops</li>
      </ol>
      <p>Ops will review your request. You will get an email when it is decided.</p>
    </Hold>
  );
}
