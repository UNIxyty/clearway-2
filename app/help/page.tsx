import { Suspense } from "react";
import HelpHome from "@/components/help/HelpHome";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <Suspense>
      <HelpHome />
    </Suspense>
  );
}
