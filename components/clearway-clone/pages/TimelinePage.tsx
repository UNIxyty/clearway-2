import { flights, permanentNotices, worldClocks } from "@/components/clearway-clone/mockData";
import type { FlightRow, TimelineStatus, WxStatus } from "@/components/clearway-clone/types";

const wxLabel: Record<WxStatus, string> = {
  above: "Above average",
  average: "Average",
  below: "Below average",
  unknown: "Forecast is not available",
};

const wxColor: Record<WxStatus, string> = {
  above: "bg-[#6ef14f]",
  average: "bg-[#d77f34]",
  below: "bg-[#c94255]",
  unknown: "bg-[#c5cad5]",
};

const timelineColor: Record<TimelineStatus, string> = {
  not_departed: "bg-[#f2f2f2]",
  airborne: "bg-[#95a8df]",
  delayed: "bg-[#f0d34b]",
  ctot: "bg-[#7348e9]",
  arrived: "bg-[#d8a8bc]",
};

function AgendaDot({ color, text }: { color: string; text: string }) {
  return (
    <li className="flex items-center gap-3 text-3xl text-slate-200">
      <span className={`inline-block size-4 rounded-full ${color}`} />
      <span>{text}</span>
    </li>
  );
}

function FlightTableRow({ row }: { row: FlightRow }) {
  return (
    <tr className="border-b border-slate-800/60 text-[25px] tabular-nums text-slate-300">
      <td className="px-2 py-1 font-semibold text-[#6ef14f]">{row.flight}</td>
      <td className="px-2 py-1 text-[#6ef14f]">{row.adep}</td>
      <td className="px-2 py-1">
        <span className={`inline-block size-4 rounded-full ${wxColor[row.wxDep]}`} />
      </td>
      <td className="px-2 py-1">{row.etd}</td>
      <td className="px-2 py-1 text-slate-400">{row.delayMin || "-"}</td>
      <td className="px-2 py-1">{row.atd || "-"}</td>
      <td className="px-2 py-1 text-[#6ef14f]">{row.ades}</td>
      <td className="px-2 py-1">
        <span className={`inline-block size-4 rounded-full ${wxColor[row.wxDes]}`} />
      </td>
      <td className="px-2 py-1">{row.eta}</td>
      <td className="px-2 py-1 text-[#d8a8bc]">{row.ata || "-"}</td>
      <td className="px-2 py-1">{row.trip}</td>
      <td className="px-2 py-1 text-slate-400">{row.dateCode}</td>
    </tr>
  );
}

export default function TimelinePage() {
  return (
    <main className="min-h-dvh bg-[#0d1726] p-6 text-slate-100">
      <header className="grid grid-cols-5 gap-8 border-b border-slate-600 pb-4">
        {worldClocks.map((clock) => (
          <div key={clock.city} className="text-center tabular-nums">
            <div className="text-7xl">{clock.time}</div>
            <div className="mt-1 text-3xl text-slate-300">{clock.city}</div>
          </div>
        ))}
      </header>
      <div className="grid grid-cols-[280px_1fr] gap-4 pt-3">
        <aside className="space-y-6">
          <div className="text-6xl tabular-nums">09.04.2026</div>
          <div>
            <h2 className="text-balance text-5xl font-semibold">WX Agenda:</h2>
            <ul className="mt-4 space-y-3">
              {(["above", "average", "below", "unknown"] as WxStatus[]).map((status) => (
                <AgendaDot key={status} color={wxColor[status]} text={wxLabel[status]} />
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-balance text-5xl font-semibold">Timeline Agenda:</h2>
            <ul className="mt-4 space-y-3">
              <AgendaDot color={timelineColor.not_departed} text="Not departed" />
              <AgendaDot color={timelineColor.airborne} text="Airborne" />
              <AgendaDot color={timelineColor.delayed} text="Delayed" />
              <AgendaDot color={timelineColor.ctot} text="CTOT" />
              <AgendaDot color={timelineColor.arrived} text="Arrived" />
            </ul>
          </div>
          <div>
            <h2 className="text-balance text-5xl font-semibold">Permanent:</h2>
            <ul className="mt-4 space-y-3 text-3xl">
              {permanentNotices.map((notice) => (
                <li key={notice.number} className="flex items-start gap-3">
                  <span className="mt-1 grid size-6 place-items-center rounded-full bg-[#ca4359] text-lg">
                    {notice.number}
                  </span>
                  <span>{notice.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <section className="rounded-md border border-slate-700 bg-[#142137] p-3">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[23px] uppercase text-slate-100">
                {["Flight", "ADEP", "WX DEP", "ETD", "DLY", "ATD", "ADES", "WX DES", "ETA", "ATA", "TRIP", "DATE"].map((col) => (
                  <th key={col} className="px-2 py-1">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flights.map((row) => (
                <FlightTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
