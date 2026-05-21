import type { ManualLimitation } from "../types";

const timelineLegend = [
  { colorClass: "statusNotDeparted", label: "Not departed" },
  { colorClass: "statusAirborne", label: "Airborne" },
  { colorClass: "statusDelayed", label: "Delayed" },
  { colorClass: "statusCtot", label: "CTOT" },
  { colorClass: "statusArrived", label: "Arrived" },
];

export function LeftAgendaPanel({ limitations }: { limitations: ManualLimitation[] }) {
  return (
    <aside className="leftAgenda">
      <section className="dateBox">01.05.2026</section>

      <section className="agendaSection">
        <h3>Timeline Agenda:</h3>
        <ul className="legendList">
          {timelineLegend.map((item) => (
            <li key={item.label}>
              <span className={`legendPill ${item.colorClass}`} aria-hidden="true" />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="agendaSection">
        <h3>Permanent:</h3>
        <ul className="permanentList">
          {limitations.map((limitation, index) => (
            <li key={limitation.id}>
              <span className="permanentIndex">{index + 1}</span>
              <span className="permanentText">{limitation.title}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
