import type { Flight, FlightStatus } from "../types";

const statusDotClass: Record<FlightStatus, string> = {
  not_departed: "statusNotDeparted",
  airborne: "statusAirborne",
  delayed: "statusDelayed",
  ctot: "statusCtot",
  arrived: "statusArrived",
};

function sortByPlannedDeparture(a: Flight, b: Flight) {
  return a.plannedDeparture.localeCompare(b.plannedDeparture);
}

export function FlightsTablePanel({ flights }: { flights: Flight[] }) {
  const sorted = [...flights].sort(sortByPlannedDeparture);

  return (
    <section className="flightsTablePanel">
      <div className="tableScroller">
        <table>
          <thead>
            <tr>
              <th>Flight</th>
              <th>ADEP</th>
              <th>WX DEP</th>
              <th>ETD</th>
              <th>DLY</th>
              <th>ATD</th>
              <th>ADES</th>
              <th>ETA</th>
              <th>Trip</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((flight) => {
              const delay =
                flight.actualDeparture && flight.actualDeparture > flight.plannedDeparture
                  ? `${Number(flight.actualDeparture.slice(0, 2)) * 60 + Number(flight.actualDeparture.slice(3)) - (Number(flight.plannedDeparture.slice(0, 2)) * 60 + Number(flight.plannedDeparture.slice(3)))}`
                  : "-";

              return (
                <tr key={flight.id}>
                  <td className="flightCol">{flight.flightNumber}</td>
                  <td>{flight.departureAirport}</td>
                  <td>
                    <span className={`statusDot ${statusDotClass[flight.status]}`} />
                  </td>
                  <td>{flight.plannedDeparture}</td>
                  <td>{delay}</td>
                  <td>{flight.actualDeparture ?? "-"}</td>
                  <td>{flight.arrivalAirport}</td>
                  <td>{flight.plannedArrival}</td>
                  <td>{flight.tripNo ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
