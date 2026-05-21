import type { Flight, FlightStatus } from "../types";

const TIMELINE_START_HOUR = 5;
const TIMELINE_END_HOUR = 23;
const MINUTES_PER_HOUR = 60;
const RANGE_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * MINUTES_PER_HOUR;

const statusClassMap: Record<FlightStatus, string> = {
  not_departed: "statusNotDeparted",
  airborne: "statusAirborne",
  delayed: "statusDelayed",
  ctot: "statusCtot",
  arrived: "statusArrived",
};

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * MINUTES_PER_HOUR + minutes;
}

function toPercent(minutes: number) {
  const timelineStart = TIMELINE_START_HOUR * MINUTES_PER_HOUR;
  return ((minutes - timelineStart) / RANGE_MINUTES) * 100;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function sortByDeparture(a: Flight, b: Flight) {
  return toMinutes(a.plannedDeparture) - toMinutes(b.plannedDeparture);
}

function getAircraftRows(flights: Flight[]) {
  const map = new Map<string, Flight[]>();

  for (const flight of flights) {
    const existing = map.get(flight.aircraftReg) ?? [];
    existing.push(flight);
    map.set(flight.aircraftReg, existing);
  }

  return [...map.entries()]
    .map(([aircraftReg, aircraftFlights]) => ({
      aircraftReg,
      flights: aircraftFlights.sort(sortByDeparture),
    }))
    .sort((a, b) => a.aircraftReg.localeCompare(b.aircraftReg));
}

function getRenderedWindow(flight: Flight) {
  const plannedDepartureMin = toMinutes(flight.plannedDeparture);
  const plannedArrivalMin = toMinutes(flight.plannedArrival);
  const actualDepartureMin = flight.actualDeparture ? toMinutes(flight.actualDeparture) : undefined;
  const delayMin =
    actualDepartureMin !== undefined && actualDepartureMin > plannedDepartureMin
      ? actualDepartureMin - plannedDepartureMin
      : 0;

  const renderedEndMin = delayMin > 0 ? plannedArrivalMin + delayMin : plannedArrivalMin;
  const delayEndMin = delayMin > 0 && actualDepartureMin !== undefined ? actualDepartureMin : plannedDepartureMin;

  return {
    plannedDepartureMin,
    plannedArrivalMin,
    renderedEndMin,
    delayEndMin,
    delayMin,
  };
}

function TimelineHourMarks() {
  const hours = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }, (_, index) => {
    const hour = TIMELINE_START_HOUR + index;
    return `${String(hour).padStart(2, "0")}:00`;
  });

  return (
    <div className="hourHeader" aria-hidden="true">
      {hours.map((hour) => (
        <div key={hour} className="hourCell">
          {hour}
        </div>
      ))}
    </div>
  );
}

export function FlightTimeline({ flights }: { flights: Flight[] }) {
  const rows = getAircraftRows(flights);

  return (
    <section className="timelineSection">
      <div className="timelineScroller">
        <TimelineHourMarks />
        <div className="timelineRows">
          {rows.map((row) => (
            <div key={row.aircraftReg} className="timelineRow">
              <div className="aircraftCell">{row.aircraftReg}</div>
              <div className="laneCell">
                <div className="hourGridLines" aria-hidden="true">
                  {Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }).map((_, idx) => (
                    <span key={`${row.aircraftReg}-line-${idx}`} />
                  ))}
                </div>
                {row.flights.map((flight) => {
                  const window = getRenderedWindow(flight);
                  const left = clampPercent(toPercent(window.plannedDepartureMin));
                  const right = clampPercent(toPercent(window.renderedEndMin));
                  const width = Math.max(2, right - left);
                  const delayWidth =
                    window.delayMin > 0
                      ? clampPercent(toPercent(window.delayEndMin)) - clampPercent(toPercent(window.plannedDepartureMin))
                      : 0;
                  const flightLeftOffset = Math.max(0, delayWidth);

                  return (
                    <article
                      key={flight.id}
                      className="flightWrapper"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      aria-label={`${flight.flightNumber} from ${flight.departureAirport} to ${flight.arrivalAirport}`}
                    >
                      <p className="flightNumber">{flight.flightNumber}</p>
                      <div className="flightMetaRow">
                        <span className="barStartLabel">
                          {flight.departureAirport} {flight.plannedDeparture}
                        </span>
                        <span className="barEndLabel">
                          {flight.arrivalAirport} {flight.plannedArrival}
                        </span>
                      </div>
                      <div className={`flightBar ${statusClassMap[flight.status]}`}>
                        {window.delayMin > 0 && (
                          <div className="delayPart">
                            <span className="delayTimeLabel">{flight.plannedDeparture}</span>
                            <span className="delayTimeLabel">{flight.actualDeparture}</span>
                          </div>
                        )}
                        <div className="actualFlightPart" style={{ left: `${flightLeftOffset}%` }} />
                        {flight.status === "ctot" && flight.ctot && (
                          <span className="ctotBadge">CTOT {flight.ctot}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
