// /client/start (design "Client Onboarding", 2026-11-10): the step right after the password — Timeline or Flights
// list. The choice is saved on the account (/api/client/prefs) and decides the page that opens after sign-in.
// "Decide later" opens Timeline and saves nothing, so the question can come back from Account.
import StartChoice from "./ui";
import PartBoundary from "@/components/client/PartBoundary";

export const metadata = { title: "How do you want to watch your flights?" };
export const dynamic = "force-dynamic";

// (the layout's shell names the person and the company; this page reads nothing of the account)
export default function ClientStartPage() {
  return <PartBoundary where="client/start" words="This page did not load."><StartChoice /></PartBoundary>;
}
