// The airport view itself is rendered by the [icao] layout so its state
// (PDF viewer, NOTAM/weather/GEN caches, sync streams) survives navigation
// between /aip/<ICAO>, /gen, /notam and /weather. This page only exists so
// those URLs resolve as real routes; the layout validates them.
export default function AirportTabPage() {
  return null;
}
