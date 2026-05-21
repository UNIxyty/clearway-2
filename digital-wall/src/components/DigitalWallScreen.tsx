import { flights, manualLimitations, worldClocks } from "../data/mock-data";
import { FlightsTablePanel } from "./FlightsTablePanel";
import { FlightTimeline } from "./FlightTimeline";
import { LeftAgendaPanel } from "./LeftAgendaPanel";
import { WorldClockBar } from "./WorldClockBar";

export function DigitalWallScreen() {
  return (
    <main className="wallScreenRoot">
      <WorldClockBar clocks={worldClocks} />
      <section className="wallContent">
        <LeftAgendaPanel limitations={manualLimitations} />
        <FlightTimeline flights={flights} />
        <FlightsTablePanel flights={flights} />
      </section>
    </main>
  );
}
