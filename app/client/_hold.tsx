"use client";
// The refused and removed pages share this (the shared status screen since 2026-11-11): the headline, one line, the
// one button (back to sign-in, which also signs this account out), and under it the person's own email and the ops
// address from the brand settings. No navigation, no counts, no product name in the copy, nothing about anyone else.
// On a phone (699 px and under) the screen is the v3 phone status layout, and the address moves to its footer.
import { useEffect, useState } from "react";
import StatusScreen from "@/components/portal/StatusScreen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function Hold({ kind, title, line, contact = "" }: { kind: string; title: string; line: string; contact?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { createSupabaseBrowserClient().auth.getUser().then(({ data }) => setEmail(data.user?.email || "")); }, []);
  const signOut = async () => { setBusy(true); try { await createSupabaseBrowserClient().auth.signOut(); } finally { window.location.href = "/login"; } };
  return (
    <main data-client-hold="">
      <StatusScreen kind={kind} eyebrow="Your access" title={title} line={line} action={{ label: "Back to sign in", onClick: () => void signOut(), busy }} support={contact}
        note={<>{email && <span data-client-email="">Signed in as {email}. </span>}{contact && <span data-client-contact="" data-status-desk="">Questions: write to <a href={`mailto:${contact}`} className="underline underline-offset-2">{contact}</a></span>}</>} />
    </main>
  );
}
