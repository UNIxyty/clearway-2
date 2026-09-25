import { Suspense } from "react";
import StandaloneDocument from "@/components/agent/viewer/StandaloneDocument";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense fallback={null}><StandaloneDocument /></Suspense>;
}
