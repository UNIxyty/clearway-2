import type { ReactNode } from "react";
import PhoneShell from "@/components/m/PhoneShell";

// The portal on a phone: every /m page sits in the phone shell (components/m/PhoneShell.tsx). The root layout's
// frame leaves /m alone (it is in Shell.tsx's BARE list), so there is no sidebar or top bar here.
export default function MobileLayout({ children }: { children: ReactNode }) {
  return <PhoneShell>{children}</PhoneShell>;
}
