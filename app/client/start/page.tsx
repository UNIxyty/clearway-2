// /client/start (design "Client Onboarding", 2026-11-10): the step right after the password — Timeline or Flights
// list. The choice is saved on the account (/api/client/prefs) and decides the page that opens after sign-in.
// "Decide later" opens Timeline and saves nothing, so the question can come back from Account.
import StartChoice from "./ui";
import { currentClient } from "@/lib/clients/server-scope";

export const metadata = { title: "How do you want to watch your flights?" };
export const dynamic = "force-dynamic";

export default async function ClientStartPage() {
  const { user, scope } = await currentClient();
  const person = String((user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? ""); // metadata-ok: the display name only
  return <StartChoice person={person} company={String(scope && !scope.nobody ? scope.company ?? "" : "")} />;
}
