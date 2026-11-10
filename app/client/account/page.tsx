// /client/account (lib/clients/allow.mjs, every approved client): who they are signed in as, a password change, the
// address to write to, and signing out. Nothing of anyone else, and nothing of their scope's values.
import ClientAccount from "./ui";
import { clientContactEmail } from "../contact";
import { currentClient } from "@/lib/clients/server-scope";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function ClientAccountPage() {
  const { user, scope } = await currentClient();
  const name = String((user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "");   // metadata-ok: the display name only
  const prefs = ((user?.user_metadata as Record<string, unknown> | undefined)?.client_prefs ?? {}) as { start?: unknown };   // metadata-ok: the person's own view preference
  const start = prefs.start === "flights" ? "flights" : prefs.start === "timeline" ? "timeline" : null;
  return <ClientAccount email={String(user?.email ?? "")} name={name} company={String(scope && !scope.nobody ? scope.company ?? "" : "")} contact={await clientContactEmail()} start={start} />;
}
