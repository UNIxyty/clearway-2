"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function UserBadge() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setId(data.user?.id ?? null);
    });
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
        <div className="text-xs text-muted-foreground">Signed in</div>
        <div className="text-sm font-medium leading-5">{email ?? "—"}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          ID <span className="font-mono">{id ?? "—"}</span>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={signOut} className="h-10">
        Sign out
      </Button>
    </div>
  );
}

