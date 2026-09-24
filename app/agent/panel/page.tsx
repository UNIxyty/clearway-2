import { Suspense } from "react";
import EmbeddedPanel from "@/components/agent/pages/EmbeddedPanel";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><EmbeddedPanel /></Suspense>;
}
