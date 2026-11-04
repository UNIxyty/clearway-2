// /client/airports (switch airport_search, lib/clients/allow.mjs): the airport search. The middleware lets a client here
// only with the switch on; the AIP link shows only with Documents on as well.
import { AirportsTab } from "../wall";
import { currentClient } from "@/lib/clients/server-scope";

export const metadata = { title: "Airports" };
export const dynamic = "force-dynamic";

export default async function ClientAirports() {
  const { scope } = await currentClient();
  return <AirportsTab documents={Boolean(scope && !scope.nobody && scope.switches.has("documents"))} />;
}
