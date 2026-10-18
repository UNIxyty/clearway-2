"use client";

// On a phone (narrower than PHONE_MAX_WIDTH), a Tier 1 desktop page sends the person to its /m counterpart — once,
// after the first measurement, so the server render and the first paint are unchanged on a desk. Renders nothing.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isPhoneWidth, useViewportWidth } from "./viewport";

export default function PhoneRedirect({ to }: { to: string }) {
  const router = useRouter();
  const w = useViewportWidth();
  useEffect(() => { if (isPhoneWidth(w)) router.replace(to); }, [w, to, router]);
  return null;
}
