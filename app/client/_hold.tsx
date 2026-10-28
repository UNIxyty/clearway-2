"use client";
// The waiting, refused and removed pages share this: a quiet tile, the person's own email, Sign out. No navigation,
// no counts, no product name in the copy (the design's brand rule), nothing about anyone else's flights.
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function Hold({ icon, title, contact = "", children }: { icon: string; title: string; contact?: string; children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  useEffect(() => { createSupabaseBrowserClient().auth.getUser().then(({ data }) => setEmail(data.user?.email || "")); }, []);
  const signOut = async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.href = "/login"; };
  return (
    <main className="cl-hold" data-client-hold="">
      <header>
        <span className="cl-tile" aria-hidden>{icon}</span>
        <span className="cl-meta">{email}</span>
        <button type="button" className="cl-btn" onClick={signOut}>Sign out</button>
      </header>
      <h1>{title}</h1>
      {children}
      {/* the one route out: an address from the brand settings, shown only once someone has filled it in */}
      {contact && <p className="cl-contact" data-client-contact="">Questions: write to <a href={`mailto:${contact}`}>{contact}</a></p>}
    </main>
  );
}
