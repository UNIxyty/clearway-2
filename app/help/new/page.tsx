import { Suspense } from "react";
import HelpComposer from "@/components/help/HelpComposer";

export const dynamic = "force-dynamic";

export default function HelpNewPage() {
  return (
    <Suspense>
      <HelpComposer />
    </Suspense>
  );
}
